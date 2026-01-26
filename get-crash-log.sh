#!/bin/bash

# Script to find and display Mulligan crash logs

echo "Searching for Mulligan crash logs..."
echo ""

# Check Xcode crash logs location
XCODE_CRASHES="$HOME/Library/Developer/Xcode/iOS DeviceSupport"
if [ -d "$XCODE_CRASHES" ]; then
    echo "Checking Xcode Device Support..."
    find "$XCODE_CRASHES" -name "*.crash" -o -name "*.ips" 2>/dev/null | grep -i mulligan | head -5
fi

# Check system crash reports
SYSTEM_CRASHES="$HOME/Library/Logs/DiagnosticReports"
if [ -d "$SYSTEM_CRASHES" ]; then
    echo ""
    echo "Checking System Diagnostic Reports..."
    find "$SYSTEM_CRASHES" -name "*Mulligan*" -o -name "*mulligan*" 2>/dev/null | head -5
fi

# Check Console.app crash logs
CONSOLE_LOGS="$HOME/Library/Logs/CrashReporter"
if [ -d "$CONSOLE_LOGS" ]; then
    echo ""
    echo "Checking Console Crash Reporter..."
    find "$CONSOLE_LOGS" -name "*Mulligan*" -o -name "*mulligan*" 2>/dev/null | head -5
fi

echo ""
echo "To view the most recent crash log, run:"
echo "  open ~/Library/Logs/DiagnosticReports"
echo ""
echo "Or use Console.app:"
echo "  open -a Console"






