"use client";

import { useState } from "react";
import { Pool } from "./Swap";

interface PoolSelectorProps {
    pools: Pool[];
    selectedPool: Pool | null;
    onSelect: (pool: Pool) => void;
    label?: string;
}

export default function PoolSelector({ pools, selectedPool, onSelect, label = "Select Pool" }: PoolSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <label className="block text-sm font-medium mb-2">{label}</label>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-left flex items-center justify-between hover:border-blue-500 transition"
            >
                <span className={selectedPool ? "text-gray-900 dark:text-white" : "text-gray-500"}>
                    {selectedPool
                        ? `${selectedPool.token0Symbol} / ${selectedPool.token1Symbol}`
                        : "Choose a pool..."}
                </span>
                <svg
                    className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto">
                        {pools.length === 0 ? (
                            <div className="p-4 text-center text-gray-500">
                                No pools available
                            </div>
                        ) : (
                            <div className="py-2">
                                {pools.map((pool, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        onClick={() => {
                                            onSelect(pool);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900 transition ${selectedPool?.address === pool.address
                                            ? "bg-blue-100 dark:bg-blue-800"
                                            : ""
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-white">
                                                    {pool.token0Symbol} / {pool.token1Symbol}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    {pool.address.slice(0, 10)}...{pool.address.slice(-8)}
                                                </p>
                                            </div>
                                            {selectedPool?.address === pool.address && (
                                                <span className="text-blue-500">✓</span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

