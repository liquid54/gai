import { useState } from 'react';

export const CustomSelect = ({ label, value, onChange, placeholder, options, icon: Icon }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <div className="text-sm text-gray-300 mb-2">{label}</div>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-[#1a1f2e] border border-gray-700 rounded px-4 py-2 text-left text-white flex justify-between items-center"
            >
                <div className="flex items-center gap-2">
                    {Icon && <Icon size={20} className="text-gray-400" />}
                    <span>{value || placeholder}</span>
                </div>
                <span className="text-gray-400">▼</span>
            </button>
            {isOpen && (
                <div className="absolute w-full mt-1 bg-[#1a1f2e] border border-gray-700 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                    {options.map((option) => (
                        <div
                            key={option.value || option.avatar_id}
                            className="px-4 py-2 hover:bg-[#2a2f3e] cursor-pointer text-white"
                            onClick={() => {
                                onChange(option.value || option.avatar_id);
                                setIsOpen(false);
                            }}
                        >
                            {option.label || option.name}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};