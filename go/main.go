package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/docseeker/usn-monitor/usn"
)

var watcher usn.FileWatcher
var notifyCh chan usn.UsnEvent
var idleTimer *time.Timer
var idleTimeout = 5 * time.Minute
var lastActivity time.Time

type Command struct {
	Type string   `json:"type"`
	Dirs []string `json:"dirs,omitempty"`
}

func main() {
	notifyCh = make(chan usn.UsnEvent, 1024)
	watcher = usn.NewUsnWatcher(notifyCh)

	idleTimer = time.NewTimer(idleTimeout)
	lastActivity = time.Now()

	go eventPump()

	ln, err := net.Listen("tcp", "127.0.0.1:29501")
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: cannot listen on 29501: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "INFO: listening on 127.0.0.1:29501\n")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-sigCh
		fmt.Fprintf(os.Stderr, "INFO: received signal, shutting down\n")
		os.Exit(0)
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			continue
		}
		go handleConn(conn)
	}
}

func handleConn(conn net.Conn) {
	defer conn.Close()
	setClient(conn)
	defer clearClient()

	lastActivity = time.Now()
	idleTimer.Reset(idleTimeout)

	scanner := bufio.NewScanner(conn)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var cmd Command
		if err := json.Unmarshal(line, &cmd); err != nil {
			jsonError(conn, fmt.Sprintf("invalid JSON: %v", err))
			continue
		}

		lastActivity = time.Now()
		idleTimer.Reset(idleTimeout)

		switch cmd.Type {
		case "init", "update_dirs":
			watcher.UpdateDirs(cmd.Dirs)
			jsonAck(conn, cmd.Type)
		case "ping":
			jsonAck(conn, "pong")
		default:
			jsonError(conn, fmt.Sprintf("unknown command: %s", cmd.Type))
		}
	}
}

func eventPump() {
	for {
		select {
		case ev := <-notifyCh:
			lastActivity = time.Now()
			idleTimer.Reset(idleTimeout)
			writeEvent(ev)
		case <-idleTimer.C:
			fmt.Fprintf(os.Stderr, "INFO: idle timeout, exiting\n")
			os.Exit(0)
		}
	}
}

type clientWriter struct {
	mu   sync.Mutex
	conn net.Conn
}

var cw clientWriter

func setClient(conn net.Conn) {
	cw.mu.Lock()
	cw.conn = conn
	cw.mu.Unlock()
}

func clearClient() {
	cw.mu.Lock()
	cw.conn = nil
	cw.mu.Unlock()
}

func writeEvent(ev usn.UsnEvent) {
	cw.mu.Lock()
	conn := cw.conn
	cw.mu.Unlock()
	if conn == nil {
		return
	}
	msg := map[string]interface{}{
		"type":      "event",
		"event":     ev.Event,
		"path":      ev.Path,
		"volume":    ev.Volume,
		"timestamp": ev.Timestamp,
	}
	if ev.OldPath != "" {
		msg["oldPath"] = ev.OldPath
	}
	data, _ := json.Marshal(msg)
	data = append(data, '\n')
	conn.Write(data)
}

func jsonAck(w io.Writer, command string) {
	msg, _ := json.Marshal(map[string]string{"type": "ack", "command": command})
	msg = append(msg, '\n')
	w.Write(msg)
}

func jsonError(w io.Writer, message string) {
	msg, _ := json.Marshal(map[string]string{"type": "err", "message": message})
	msg = append(msg, '\n')
	w.Write(msg)
}
