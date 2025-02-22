const LogEntry = ({ timestamp, message }) => (
    <div className="text-sm text-gray-400 py-1">
        [{timestamp}] {message}
    </div>
);

export default LogEntry;