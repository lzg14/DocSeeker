#!/bin/bash
# Claude Code Status Line Script
# Reads JSON input from stdin and displays relevant status information

input=$(cat)

# Extract key information using jq
model=$(echo "$input" | jq -r '.model.display_name // empty')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // empty')
project=$(echo "$input" | jq -r '.workspace.project_dir // empty')
session_name=$(echo "$input" | jq -r '.session_name // empty')
context_used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
context_remaining=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')

# Build status line output
output=""

# Model name (truncated if too long)
if [ -n "$model" ]; then
  output="${output}[$model]"
fi

# Session name if set
if [ -n "$session_name" ]; then
  output="${output} [$session_name]"
fi

# Current directory (shortened to basename if same as project)
if [ -n "$cwd" ]; then
  if [ -n "$project" ] && [ "$cwd" = "$project" ]; then
    output="${output} $(basename "$cwd")"
  else
    # Show last 2 directories of path
    display_dir=$(echo "$cwd" | sed 's|.*/\(.*/.*\)|\1|')
    output="${output} $display_dir"
  fi
fi

# Context usage
if [ -n "$context_used" ]; then
  output="${output} \033[2m(Context: ${context_used}% used)\033[0m"
elif [ -n "$context_remaining" ]; then
  output="${output} \033[2m(Context: ${context_remaining}% remaining)\033[0m"
fi

# Rate limits (if available)
five_hour=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
seven_day=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

if [ -n "$five_hour" ]; then
  output="${output} \033[2m5h:$(printf '%.0f' "$five_hour")%\033[0m"
fi
if [ -n "$seven_day" ]; then
  output="${output} \033[2m 7d:$(printf '%.0f' "$seven_day")%\033[0m"
fi

# Vim mode if present
vim_mode=$(echo "$input" | jq -r '.vim.mode // empty')
if [ -n "$vim_mode" ]; then
  output="${output} \033[1m[$vim_mode]\033[0m"
fi

echo "$output"