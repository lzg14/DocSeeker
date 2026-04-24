package main

import (
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// State values for Ctrl detection
const (
	stateIdle    int32 = 0
	statePressed int32 = 1
	stateWaiting int32 = 2
)

type keyboardHook struct {
	ctrlState atomic.Int32
	timer     *time.Timer
	done      chan struct{}
	isRunning atomic.Bool
	callback  func()
	mu        sync.Mutex // Protects timer access
}

var activeHook *keyboardHook

// DoubleCtrlWindow is the max interval between two Ctrl releases
const DoubleCtrlWindow = 300 * time.Millisecond

// GetAsyncKeyState from user32.dll
// Returns the state of the specified virtual key
func GetAsyncKeyState(vkey int32) uintptr {
	ret, _, _ := syscall.NewLazyDLL("user32.dll").NewProc("GetAsyncKeyState").Call(uintptr(vkey))
	return ret
}

// StartKeyboardHook starts polling for Ctrl key to detect double-tap.
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

	activeHook.mu.Lock()
	if activeHook.timer != nil {
		activeHook.timer.Stop()
	}
	activeHook.mu.Unlock()

	close(activeHook.done)
	activeHook.isRunning.Store(false)
	activeHook = nil
}

func (hk *keyboardHook) run() {
	hk.isRunning.Store(true)
	fmt.Fprintf(os.Stderr, "DEBUG: keyboard hook started (polling mode)\n")

	// Polling interval
	pollInterval := 16 * time.Millisecond // ~60fps

	for {
		select {
		case <-hk.done:
			fmt.Fprintf(os.Stderr, "DEBUG: keyboard hook stopped\n")
			hk.isRunning.Store(false)
			return
		default:
			hk.checkCtrlKey()
			time.Sleep(pollInterval)
		}
	}
}

func (hk *keyboardHook) checkCtrlKey() {
	if !hk.isRunning.Load() {
		return
	}

	// Check if Ctrl key is currently pressed using GetAsyncKeyState
	// VK_CONTROL = 0x11
	ctrlPressed := GetAsyncKeyState(0x11)&0x8000 != 0

	prevState := hk.ctrlState.Load()

	if ctrlPressed && prevState == stateIdle {
		// Ctrl just pressed
		hk.ctrlState.Store(statePressed)
		fmt.Fprintf(os.Stderr, "DEBUG: Ctrl pressed\n")
	} else if !ctrlPressed && prevState == statePressed {
		// Ctrl just released - check for second press
		hk.ctrlState.Store(stateWaiting)
		hk.mu.Lock()
		if hk.timer != nil {
			hk.timer.Stop()
		}
		hk.timer = time.AfterFunc(DoubleCtrlWindow, func() {
			hk.ctrlState.Store(stateIdle)
		})
		hk.mu.Unlock()
		fmt.Fprintf(os.Stderr, "DEBUG: Ctrl released, waiting for second press\n")
	} else if ctrlPressed && prevState == stateWaiting {
		// Second Ctrl press detected within window!
		hk.mu.Lock()
		if hk.timer != nil {
			hk.timer.Stop()
		}
		hk.mu.Unlock()
		hk.ctrlState.Store(stateIdle)
		fmt.Fprintf(os.Stderr, "INFO: double-ctrl detected!\n")
		go hk.callback()
	}
}
