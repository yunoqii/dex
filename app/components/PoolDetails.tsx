"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { POOL_ABI, ERC20_ABI } from "../config";
import { useToast } from "../contexts/ToastContext";

interface PoolDetailsProps {
    poolAddress: string;
    onClose: () => void;
}

interface PoolData {
    token0: { address: string; name: string; symbol: string; decimals: number; reserve: string };
    token1: { address: string; name: string; symbol: string; decimals: number; reserve: string };
    price: number;
}

export default function PoolDetails({ poolAddress, onClose }: PoolDetailsProps) {
    const [poolData, setPoolData] = useState<PoolData | null>(null);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    useEffect(() => {
        loadPoolData();
    }, [poolAddress]);

    const loadPoolData = async () => {
        if (typeof window.ethereum === "undefined") return;

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);

            const [token0, token1, reserves, token0Decimals, token1Decimals] = await Promise.all([
                pool.token0(),
                pool.token1(),
                pool.getReserves(),
                pool.token0Decimals(),
                pool.token1Decimals(),
            ]);

            const token0Contract = new ethers.Contract(token0, ERC20_ABI, provider);
            const token1Contract = new ethers.Contract(token1, ERC20_ABI, provider);

            const [token0Name, token0Symbol, token1Name, token1Symbol] = await Promise.all([
                token0Contract.name().catch(() => "Token 0"),
                token0Contract.symbol().catch(() => "TKN0"),
                token1Contract.name().catch(() => "Token 1"),
                token1Contract.symbol().catch(() => "TKN1"),
            ]);

            const reserve0 = ethers.formatUnits(reserves[0], Number(token0Decimals));
            const reserve1 = ethers.formatUnits(reserves[1], Number(token1Decimals));

            // Calculate price
            const price = reserves[1] > BigInt(0) && reserves[0] > BigInt(0)
                ? Number(reserves[1]) / Number(reserves[0])
                : 0;

            setPoolData({
                token0: { address: token0, name: token0Name, symbol: token0Symbol, decimals: Number(token0Decimals), reserve: reserve0 },
                token1: { address: token1, name: token1Name, symbol: token1Symbol, decimals: Number(token1Decimals), reserve: reserve1 },
                price,
            });
        } catch (error) {
            console.error("Error loading pool data:", error);
            showToast("Failed to load pool details", "error");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading pool details...</p>
                </div>
            </div>
        );
    }

    if (!poolData) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Pool Details
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl font-bold"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                            Pool Address
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-mono break-all">
                            {poolAddress}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                                {poolData.token0.symbol}
                            </h4>
                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-1">
                                {poolData.token0.name}
                            </p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-mono break-all mb-2">
                                {poolData.token0.address}
                            </p>
                            <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                Reserve: {Number(poolData.token0.reserve).toLocaleString()} {poolData.token0.symbol}
                            </p>
                        </div>

                        <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4">
                            <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                                {poolData.token1.symbol}
                            </h4>
                            <p className="text-sm text-green-700 dark:text-green-300 mb-1">
                                {poolData.token1.name}
                            </p>
                            <p className="text-xs text-green-600 dark:text-green-400 font-mono break-all mb-2">
                                {poolData.token1.address}
                            </p>
                            <p className="text-lg font-bold text-green-900 dark:text-green-100">
                                Reserve: {Number(poolData.token1.reserve).toLocaleString()} {poolData.token1.symbol}
                            </p>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">Price</h4>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            1 {poolData.token0.symbol} = {poolData.price.toFixed(6)} {poolData.token1.symbol}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            1 {poolData.token1.symbol} = {(1 / poolData.price).toFixed(6)} {poolData.token0.symbol}
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <a
                            href={`https://sepolia.etherscan.io/address/${poolAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-center transition"
                        >
                            View on Etherscan
                        </a>
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

