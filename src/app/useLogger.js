import { useState } from 'react';

const useLogger = () => {
    const [logs, setLogs] = useState([]);

    const addLog = (message) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { timestamp, message }]);
    };

    return { logs, addLog };
};

export default useLogger;