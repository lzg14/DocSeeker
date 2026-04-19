package usn

import (
	"encoding/binary"
	"fmt"
	"strings"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	FSCTL_CREATE_USN_JOURNAL    uint32 = 0x900f4
	FSCTL_READ_USN_JOURNAL       uint32 = 0x900f3
	FSCTL_DELETE_USN_JOURNAL     uint32 = 0x900f5
	USN_PAGE_SIZE                uint32 = 0x1000

	FILE_CREATE                uint32 = 0x1000000
	FILE_DELETE                uint32 = 0x2000000
	FILE_RENAMED_OLD_NAME      uint32 = 0x4000000
	FILE_RENAMED_NEW_NAME      uint32 = 0x8000000
	DATA_OVERWRITE             uint32 = 0x1
	DATA_TRUNCATION            uint32 = 0x4
	FILE_ATTRIBUTE_DIRECTORY   uint32 = 0x10
)

// USN_JOURNAL_DATA describes the USN journal for a volume.
type usnJournalData struct {
	UsnJournalID       uint64
	FirstUsn           int64
	NextUsn            int64
	LowestValidUsn     int64
	MaxUsn             int64
	AllocationDelta    int64
}

// USN_RECORD_V2 fixed-size header (64 bytes).
type usnRecordV2 struct {
	RecordLength       uint32
	MajorVersion       uint16
	MinorVersion       uint16
	FileReferenceNumber uint64
	ParentFileReferenceNumber uint64
	Usn                int64
	Timestamp          int64
	Reason             uint32
	SourceInfo         uint32
	FileAttributes     uint32
	FileNameLength     uint16
	FileNameOffset     uint16
}

// UsnEvent represents a file system event.
type UsnEvent struct {
	Event       string
	Path        string
	Volume      string
	Timestamp   int64
	OldPath     string
	IsDirectory bool
}

// OpenVolume opens a volume by drive letter (e.g. "C:" -> "\\\\.\\C:").
func OpenVolume(driveLetter string) (windows.Handle, error) {
	vol := `\\.` + string(driveLetter[0]) + `:`
	return windows.CreateFile(
		windows.StringToUTF16Ptr(vol),
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE,
		nil,
		windows.OPEN_EXISTING,
		0,
		0,
	)
}

// CreateJournal creates a USN journal on the volume. Idempotent.
func CreateJournal(h windows.Handle) (*usnJournalData, error) {
	data := &usnJournalData{AllocationDelta: 8 * 1024 * 1024}
	var bytesReturned uint32
	err := windows.DeviceIoControl(
		h,
		FSCTL_CREATE_USN_JOURNAL,
		nil,
		0,
		(*byte)(unsafe.Pointer(data)),
		uint32(unsafe.Sizeof(*data)),
		&bytesReturned,
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("FSCTL_CREATE_USN_JOURNAL: %w", err)
	}
	return data, nil
}

// ReadJournalStart starts reading from the journal from a given USN.
// Returns the next USN to read from.
func ReadJournalStart(h windows.Handle, journalID uint64, startUsn int64) ([]UsnEvent, int64, error) {
	buf := make([]byte, 64*1024)
	var bytesReturned uint32

	input := struct {
		UsnJournalID uint64
		StartUsn      int64
		ReasonMask    uint32
		ReturnOnlyOnClose uint32
		Timeout        uint64
		MaxUsn         uint64
		AllocationDelta uint64
	}{
		UsnJournalID:     journalID,
		StartUsn:         startUsn,
		ReasonMask:       0xFFFFFFFF,
		ReturnOnlyOnClose: 0,
		Timeout:          0,
		MaxUsn:           0,
		AllocationDelta:  8 * 1024 * 1024,
	}

	err := windows.DeviceIoControl(
		h,
		FSCTL_READ_USN_JOURNAL,
		(*byte)(unsafe.Pointer(&input)),
		uint32(unsafe.Sizeof(input)),
		(*byte)(unsafe.Pointer(&buf[0])),
		uint32(len(buf)),
		&bytesReturned,
		nil,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("FSCTL_READ_USN_JOURNAL: %w", err)
	}

	if bytesReturned < 8 {
		return nil, 0, nil
	}

	// First 8 bytes: next USN (use encoding/binary, NOT windows.ByteSliceToLittleEndian)
	nextUsn := int64(binary.LittleEndian.Uint64(buf[:8]))

	events, err := parseUsnRecords(buf[8:bytesReturned])
	return events, nextUsn, nil
}

// parseUsnRecords parses raw USN record bytes into UsnEvent structs.
func parseUsnRecords(data []byte) ([]UsnEvent, error) {
	var events []UsnEvent
	offset := 0

	for offset+64 <= len(data) {
		rec := (*usnRecordV2)(unsafe.Pointer(&data[offset]))
		recLen := int(rec.RecordLength)

		if recLen < 64 || offset+int(recLen) > len(data) {
			break
		}

		nameBytes := data[offset+int(rec.FileNameOffset) : offset+int(rec.FileNameOffset)+int(rec.FileNameLength)]
		name := utf16ToString(nameBytes)

		isDir := (rec.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0
		reason := rec.Reason

		// Group FILE_RENAMED_OLD_NAME + FILE_RENAMED_NEW_NAME as one "renamed" event
		if reason&FILE_RENAMED_OLD_NAME != 0 {
			events = append(events, UsnEvent{
				Event:       "rename_old",
				Path:        name,
				Timestamp:   rec.Timestamp / 10000, // 1601 FILETIME -> epoch ms
				IsDirectory: isDir,
			})
		}
		if reason&FILE_RENAMED_NEW_NAME != 0 {
			events = append(events, UsnEvent{
				Event:       "rename_new",
				Path:        name,
				Timestamp:   rec.Timestamp / 10000,
				IsDirectory: isDir,
			})
		}

		// Simple create / delete / modify (skip if already handled as rename)
		if reason&FILE_CREATE != 0 {
			events = append(events, UsnEvent{Event: "created", Path: name, Timestamp: rec.Timestamp / 10000, IsDirectory: isDir})
		}
		if reason&FILE_DELETE != 0 {
			events = append(events, UsnEvent{Event: "deleted", Path: name, Timestamp: rec.Timestamp / 10000, IsDirectory: isDir})
		}
		if reason&(DATA_OVERWRITE|DATA_TRUNCATION) != 0 {
			events = append(events, UsnEvent{Event: "modified", Path: name, Timestamp: rec.Timestamp / 10000, IsDirectory: false})
		}

		offset += int(recLen)
	}

	return events, nil
}

func utf16ToString(b []byte) string {
	if len(b)%2 != 0 {
		b = b[:len(b)-1]
	}
	u16 := make([]uint16, len(b)/2)
	for i := range u16 {
		u16[i] = uint16(b[i*2]) | uint16(b[i*2+1])<<8
	}
	return strings.TrimRight(string(utf16.Decode(u16)), "\x00")
}
