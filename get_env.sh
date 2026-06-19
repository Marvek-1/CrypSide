#!/bin/bash
pid=$(pgrep -f 'api.py' | head -1)
if [ -n "$pid" ]; then
    echo "Found api.py running at PID: $pid"
    cat /proc/$pid/environ | tr '\0' '\n' | grep -i 'DATABASE\|DEMO'
else
    echo "No api.py process found"
fi
