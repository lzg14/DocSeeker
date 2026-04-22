package main

import (
	"fmt"
	"os"
	"sync/atomic"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	VK_CONTROL     = 0x11
	WH_KEYBOARD_LL = 13
	WM_KEYDOWN     = 0x0100
	WM_KEYUP       = 0x0101
)

// State values for Ctrl detection
const (
	stateIdle    int32 = 0
	statePressed int32 = 1
	stateWaiting int32 = 2
)

type keyboardHook struct {
	ctrlState atomic.Int32
	timer    *time.Timer
	done     chan struct{}
	isRunning atomic.Bool
	callback func()
}

var activeHook *keyboardHook

// DoubleCtrlWindow is the max interval between two Ctrl releases
const DoubleCtrlWindow = 300 * time.Millisecond

// StartKeyboardHook registers a low-level keyboard hook to detect double-tap Ctrl.
func StartKeyboardHook(callback func()) error {
	if activeHook != nil && activeHook.isRunning.Load() {
		return nil
	}
	hk := &keyboardHook{done: make(chan struct{}), callback: callback}
	activeHook = hk
	go hk.run()
	return nil
}

// StopKeyboardHook stops the keyboard hook.
func StopKeyboardHook() {
	if activeHook == nil || !activeHook.isRunning.Load() {
		return
	}
	close(activeHook.done)
	activeHook.isRunning.Store(false)
	activeHook = nil
}

func (hk *keyboardHook) run() {
	hk.isRunning.Store(true)
	fmt.Fprintf(os.Stderr, "DEBUG: keyboard hook started\n")

	moduser32 := windows.NewLazyDLL("user32.dll")
	procSetHook := moduser32.NewProc("SetWindowsHookExW")
	procUnhook := moduser32.NewProc("UnhookWindowsHookEx")
	procCallNext := moduser32.NewProc("CallNextHookEx")
	procGetMsg := moduser32.NewProc("GetMessageW")
	procTranslate := moduser32.NewProc("TranslateMessage")
	procDispatch := moduser32.NewProc("DispatchMessageW")
	procGetModuleHandle := windows.NewLazyDLL("kernel32.dll").NewProc("GetModuleHandleW")

	module, _, _ := procGetModuleHandle.Call(0)

	kbProc := windows.NewCallback(func(code int32, wparam uintptr, lparam uintptr) uintptr {
		if code >= 0 {
			p := (*KBDLLHOOKSTRUCT)(unsafe.Pointer(lparam))
			if p.VirtualKey == VK_CONTROL {
				switch wparam {
				case WM_KEYDOWN:
					hk.onCtrlDown()
				case WM_KEYUP:
					hk.onCtrlUp()
				}
			}
		}
		ret, _, _ := procCallNext.Call(0, uintptr(code), wparam, lparam)
		return ret
	})

	hook, _, err := procSetHook.Call(
		uintptr(WH_KEYBOARD_LL),
		uintptr(kbProc),
		uintptr(module),
		0,
	)

	if hook == 0 {
		fmt.Fprintf(os.Stderr, "ERROR: SetWindowsHookEx failed: %v\n", err)
		hk.isRunning.Store(false)
		return
	}

	fmt.Fprintf(os.Stderr, "DEBUG: hook handle: %d\n", hook)

	// Message loop
	var msg MSG
	for {
		select {
		case <-hk.done:
			procUnhook.Call(hook)
			fmt.Fprintf(os.Stderr, "DEBUG: keyboard hook stopped\n")
			return
		default:
			ret, _, _ := procGetMsg.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
			if ret != 0 {
				procTranslate.Call(uintptr(unsafe.Pointer(&msg)))
				procDispatch.Call(uintptr(unsafe.Pointer(&msg)))
			}
		}
	}
}

func (hk *keyboardHook) onCtrlDown() {
	if !hk.isRunning.Load() {
		return
	}
	hk.ctrlState.Store(statePressed)
}

func (hk *keyboardHook) onCtrlUp() {
	if !hk.isRunning.Load() {
		return
	}
	prev := hk.ctrlState.Swap(stateIdle)
	if prev == stateWaiting {
		hk.ctrlState.Store(stateIdle)
		if hk.timer != nil {
			hk.timer.Stop()
		}
		fmt.Fprintf(os.Stderr, "INFO: double-ctrl detected!\n")
		go hk.callback()
	} else if prev == statePressed {
		hk.ctrlState.Store(stateWaiting)
		if hk.timer != nil {
			hk.timer.Stop()
		}
		hk.timer = time.AfterFunc(DoubleCtrlWindow, func() {
			hk.ctrlState.Store(stateIdle)
		})
	}
}

// KBDLLHOOKSTRUCT for low-level keyboard hooks
type KBDLLHOOKSTRUCT struct {
	VirtualKey uint32
	ScanCode   uint32
	Flags      uint32
	Time       uint32
	ExtraInfo  uintptr
}

// MSG structure for GetMessage
type MSG struct {
	Hwnd    windows.Handle
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      POINT
}

// POINT structure
type POINT struct {
	X int32
	Y int32
}
