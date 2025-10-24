 // WebSocket connection
        let ws = null;
        let isConnected = false;
        const ESP_IP = "192.168.4.1"; // Default ESP8266 AP IP

        // DOM Elements
        const joystickLeft = document.getElementById('joystickLeft');
        const joystickRight = document.getElementById('joystickRight');
        const throttleBars = [
            document.getElementById('throttle1'),
            document.getElementById('throttle2'),
            document.getElementById('throttle3'),
            document.getElementById('throttle4')
        ];
        const throttleValues = [
            document.getElementById('throttleValue1'),
            document.getElementById('throttleValue2'),
            document.getElementById('throttleValue3'),
            document.getElementById('throttleValue4')
        ];
        const connectionStatus = document.getElementById('connectionStatus');
        const rpmFill = document.getElementById('rpmFill');
        const rpmText = document.getElementById('rpmText');
        const wifiButton = document.getElementById('wifiButton');
        const wifiList = document.getElementById('wifiList');
        const dataDisplay = document.getElementById('dataDisplay');
        const escCalibrateBtn = document.getElementById('escCalibrate');
        const motorCalibrateBtn = document.getElementById('motorCalibrate');
        const takeoffBtn = document.getElementById('takeoff');
        const landBtn = document.getElementById('land');

        // Joystick variables
        let activeJoystick = null;
        const joystickData = {
            left: { x: 0, y: 0 },
            right: { x: 0, y: 0 }
        };

        // Throttle values (0-100%)
        const throttle = [0, 0, 0, 0];

        // Initialize connection
        function initConnection() {
            connectWebSocket();
            setInterval(sendControlData, 50); // 20Hz update rate
            
            // Initialize joysticks
            initJoystick(joystickLeft, 'left');
            initJoystick(joystickRight, 'right');
            
            // Initialize throttle
            throttle.fill(25);
            for (let i = 0; i < 4; i++) {
                updateThrottleBar(i);
            }
            updateRPM();
            
            // Add event listeners
            setupEventListeners();
            
            // Add initial data display entries
            addToDataDisplay('> System initialized successfully');
            addToDataDisplay('> Dual joystick control active');
            addToDataDisplay('> Throttle system online');
            addToDataDisplay('> Waiting for WiFi connection...');
        }

        function connectWebSocket() {
            try {
                ws = new WebSocket(`ws://${ESP_IP}:81/`);
                
                ws.onopen = function() {
                    isConnected = true;
                    connectionStatus.textContent = 'CONNECTED';
                    connectionStatus.className = 'status-value connected';
                    addToDataDisplay('> Connected to ESP8266');
                    addToDataDisplay('> Drone control system ready');
                };
                
                ws.onmessage = function(event) {
                    try {
                        const data = JSON.parse(event.data);
                        handleWebSocketMessage(data);
                    } catch (e) {
                        console.log('Raw message:', event.data);
                    }
                };
                
                ws.onclose = function() {
                    isConnected = false;
                    connectionStatus.textContent = 'DISCONNECTED';
                    connectionStatus.className = 'status-value disconnected';
                    addToDataDisplay('> Disconnected from ESP8266');
                    
                    // Attempt reconnect after 3 seconds
                    setTimeout(connectWebSocket, 3000);
                };
                
                ws.onerror = function(error) {
                    addToDataDisplay('> WebSocket error: ' + error);
                };
                
            } catch (error) {
                addToDataDisplay('> Connection error: ' + error);
            }
        }

        function handleWebSocketMessage(data) {
            switch(data.type) {
                case 'status':
                    updateStatusDisplay(data);
                    break;
                case 'arduino_status':
                    addToDataDisplay('> Arduino: ' + data.status);
                    break;
                case 'calibration':
                    addToDataDisplay('> ' + data.message);
                    break;
                case 'flight':
                    addToDataDisplay('> ' + data.message);
                    break;
                case 'connected':
                    addToDataDisplay('> ' + data.message);
                    break;
            }
        }

        function updateStatusDisplay(data) {
            if (data.motors) {
                const motorValues = data.motors.split(',');
                if (motorValues.length >= 5) {
                    // Update RPM display
                    const rpm = parseInt(motorValues[4]);
                    const rpmPercent = (rpm / 7000) * 100;
                    rpmFill.style.width = `${rpmPercent}%`;
                    rpmText.textContent = `${rpm} RPM`;
                    
                    // Update individual motor displays
                    for (let i = 0; i < 4; i++) {
                        throttleValues[i].textContent = `${motorValues[i]}%`;
                    }
                }
            }
        }

        function sendControlData() {
            if (!isConnected || !ws) return;
            
            // Format: T1,T2,T3,T4,LX,LY,RX,RY
            // Values are integers: throttle 0-100, joystick -100 to 100
            const controlString = 
                throttle[0] + ',' +
                throttle[1] + ',' +
                throttle[2] + ',' +
                throttle[3] + ',' +
                Math.round(joystickData.left.x * 100) + ',' +
                Math.round(joystickData.left.y * 100) + ',' +
                Math.round(joystickData.right.x * 100) + ',' +
                Math.round(joystickData.right.y * 100);
            
            ws.send(`CTRL:${controlString}`);
        }

        function sendCommand(command) {
            if (!isConnected || !ws) {
                addToDataDisplay('> ERROR: Not connected to drone');
                return;
            }
            
            const commandMap = {
                'esc_cal': 'ESC Calibration',
                'motor_cal': 'Motor Calibration', 
                'takeoff': 'Takeoff',
                'land': 'Land'
            };
            
            addToDataDisplay(`> Sending ${commandMap[command]} command...`);
            ws.send(JSON.stringify({type: 'command', value: command}));
        }

        function initJoystick(joystick, joystickType) {
            let isDragging = false;
            let startX, startY;
            let touchId = null;
            
            const base = joystick.parentElement;
            const baseRect = base.getBoundingClientRect();
            const baseCenterX = baseRect.left + baseRect.width / 2;
            const baseCenterY = baseRect.top + baseRect.height / 2;
            const maxDistance = baseRect.width / 2 - joystick.offsetWidth / 2;
            
            function startDrag(clientX, clientY, id) {
                isDragging = true;
                touchId = id;
                startX = clientX;
                startY = clientY;
                activeJoystick = joystickType;
                joystick.style.transition = 'none';
            }
            
            function duringDrag(clientX, clientY) {
                if (!isDragging) return;
                
                const deltaX = clientX - baseCenterX;
                const deltaY = clientY - baseCenterY;
                
                // Calculate distance from center
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                
                // Normalize if beyond max distance
                const normalizedX = deltaX / (distance || 1);
                const normalizedY = deltaY / (distance || 1);
                
                // Limit to max distance
                const limitedX = normalizedX * Math.min(distance, maxDistance);
                const limitedY = normalizedY * Math.min(distance, maxDistance);
                
                // Update joystick position
                joystick.style.transform = `translate(calc(-50% + ${limitedX}px), calc(-50% + ${limitedY}px))`;
                
                // Update joystick data (-1 to 1 range)
                joystickData[joystickType].x = limitedX / maxDistance;
                joystickData[joystickType].y = -limitedY / maxDistance; // Invert Y for intuitive control
                
                // Update drone control based on joystick movement
                updateDroneControl();
            }
            
            function endDrag() {
                if (!isDragging) return;
                
                isDragging = false;
                touchId = null;
                activeJoystick = null;
                
                // Animate back to center
                joystick.style.transition = 'transform 0.3s ease';
                joystick.style.transform = 'translate(-50%, -50%)';
                
                // Reset joystick data
                joystickData[joystickType].x = 0;
                joystickData[joystickType].y = 0;
                
                // Update drone control
                updateDroneControl();
            }
            
            // Mouse events
            joystick.addEventListener('mousedown', (e) => {
                e.preventDefault();
                startDrag(e.clientX, e.clientY, null);
            });
            
            document.addEventListener('mousemove', (e) => {
                if (isDragging && activeJoystick === joystickType) {
                    duringDrag(e.clientX, e.clientY);
                }
            });
            
            document.addEventListener('mouseup', () => {
                if (activeJoystick === joystickType) {
                    endDrag();
                }
            });
            
            // Touch events
            joystick.addEventListener('touchstart', (e) => {
                if (activeJoystick === null) {
                    const touch = e.touches[0];
                    startDrag(touch.clientX, touch.clientY, touch.identifier);
                }
            });
            
            document.addEventListener('touchmove', (e) => {
                if (isDragging && activeJoystick === joystickType) {
                    // Find the correct touch
                    for (let i = 0; i < e.touches.length; i++) {
                        if (e.touches[i].identifier === touchId) {
                            duringDrag(e.touches[i].clientX, e.touches[i].clientY);
                            break;
                        }
                    }
                }
            });
            
            document.addEventListener('touchend', (e) => {
                if (isDragging && activeJoystick === joystickType) {
                    // Check if our touch ended
                    let touchStillActive = false;
                    for (let i = 0; i < e.touches.length; i++) {
                        if (e.touches[i].identifier === touchId) {
                            touchStillActive = true;
                            break;
                        }
                    }
                    
                    if (!touchStillActive) {
                        endDrag();
                    }
                }
            });
        }

        // Update drone control based on joystick and throttle values
        function updateDroneControl() {
            // Calculate motor values based on joystick positions and throttle
            const baseThrottle = throttle.reduce((sum, val) => sum + val, 0) / 4;
            
            // Adjust individual motor RPM based on joystick inputs
            const throttleAdjust = joystickData.left.y * 20; // ±20% throttle adjustment
            const yawAdjust = joystickData.left.x * 15;      // Yaw adjustment
            const rollAdjust = joystickData.right.x * 15;    // Roll adjustment
            const pitchAdjust = joystickData.right.y * 15;   // Pitch adjustment
            
            // Calculate individual motor adjustments (quadcopter X configuration)
            const motorAdjustments = [
                baseThrottle + throttleAdjust - yawAdjust + rollAdjust + pitchAdjust, // Motor 1
                baseThrottle + throttleAdjust + yawAdjust + rollAdjust - pitchAdjust, // Motor 2
                baseThrottle + throttleAdjust - yawAdjust - rollAdjust - pitchAdjust, // Motor 3
                baseThrottle + throttleAdjust + yawAdjust - rollAdjust + pitchAdjust  // Motor 4
            ];
            
            // Ensure values are within 0-100% range
            for (let i = 0; i < 4; i++) {
                throttle[i] = Math.max(0, Math.min(100, motorAdjustments[i]));
                updateThrottleBar(i);
            }
            
            // Update RPM display
            updateRPM();
        }

        // Update individual throttle bar
        function updateThrottleBar(index) {
            throttleBars[index].style.height = `${throttle[index]}%`;
            throttleValues[index].textContent = `${Math.round(throttle[index])}%`;
        }

        // Update RPM display
        function updateRPM() {
            const avgThrottle = throttle.reduce((sum, val) => sum + val, 0) / 4;
            const rpm = Math.round((avgThrottle / 100) * 7000);
            
            rpmFill.style.width = `${avgThrottle}%`;
            rpmText.textContent = `${rpm} RPM`;
        }

        // Add message to data display
        function addToDataDisplay(message) {
            const newEntry = document.createElement('div');
            newEntry.textContent = message;
            dataDisplay.appendChild(newEntry);
            dataDisplay.scrollTop = dataDisplay.scrollHeight;
            
            // Limit to 50 entries to prevent performance issues
            if (dataDisplay.children.length > 50) {
                dataDisplay.removeChild(dataDisplay.firstChild);
            }
        }

        function setupEventListeners() {
            // WiFi functionality
            wifiButton.addEventListener('click', () => {
                wifiList.style.display = wifiList.style.display === 'block' ? 'none' : 'block';
                
                if (wifiList.style.display === 'block') {
                    addToDataDisplay('> Scanning for WiFi networks...');
                    
                    // Simulate network scan
                    setTimeout(() => {
                        addToDataDisplay('> Found 4 networks');
                    }, 1000);
                }
            });
            
            // Connect to ESP8266 network
            const wifiItems = document.querySelectorAll('.wifi-item');
            wifiItems.forEach(item => {
                item.addEventListener('click', () => {
                    if (item.textContent === 'ESP8266_Drone_Control') {
                        addToDataDisplay('> Connecting to ESP8266_Drone_Control...');
                        
                        // Simulate connection process
                        setTimeout(() => {
                            addToDataDisplay('> Connected to ESP8266_Drone_Control');
                            addToDataDisplay('> Drone control system ready');
                        }, 2000);
                    } else {
                        addToDataDisplay(`> Cannot connect to ${item.textContent} - ESP8266 required`);
                    }
                    
                    wifiList.style.display = 'none';
                });
            });
            
            // Calibration buttons
            escCalibrateBtn.addEventListener('click', () => {
                sendCommand('esc_cal');
            });
            
            motorCalibrateBtn.addEventListener('click', () => {
                sendCommand('motor_cal');
            });
            
            // Takeoff and land buttons
            takeoffBtn.addEventListener('click', () => {
                sendCommand('takeoff');
            });
            
            landBtn.addEventListener('click', () => {
                sendCommand('land');
            });
        }

        // Initialize when page loads
        window.addEventListener('load', initConnection);
