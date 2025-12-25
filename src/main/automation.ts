import robot from 'robotjs';

export function simulatePaste() {
    console.log('Simulating paste...');
    // Check OS for modifier key (Control on Windows/Linux, Command on Mac)
    const modifier = process.platform === 'darwin' ? 'command' : 'control';

    // Basic validation that robotjs is working
    try {
        robot.keyTap('v', [modifier]);
        console.log('Paste command sent.');
    } catch (error) {
        console.error('Failed to simulate paste:', error);
        throw error;
    }
}

export function simulateCopy() {
    console.log('Simulating copy...');
    const modifier = process.platform === 'darwin' ? 'command' : 'control';
    try {
        robot.keyTap('c', [modifier]);
        console.log('Copy command sent.');
    } catch (error) {
        console.error('Failed to simulate copy:', error);
        throw error;
    }
}

export function releaseModifiers() {
    try {
        console.log('Releasing modifiers...');
        robot.keyToggle('shift', 'up');
        robot.keyToggle('control', 'up');
        robot.keyToggle('alt', 'up');
        if (process.platform === 'darwin') {
            robot.keyToggle('command', 'up');
        }
        console.log('Modifiers released.');
    } catch (error) {
        console.error('Failed to release modifiers:', error);
    }
}


