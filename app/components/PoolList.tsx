"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACTS, FACTORY_ABI, POOL_ABI, ERC20_ABI } from "../config";
import PoolDetails from "./PoolDetails";

interface Pool {
    address: string;
    token0: string;
    token1: string;
    reserve0: string;
    reserve1: string;
    token0Symbol: string;
    token1Symbol: string;
}

export default function PoolList() {
    const [pools, setPools] = useState<Pool[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPoolAddress, setSelectedPoolAddress] = useState<string | null>(null);

    const loadPools = async () => {
        if (typeof window.ethereum === "undefined") return;

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const factory = new ethers.Contract(CONTRACTS.FACTORY, FACTORY_ABI, provider);

            const poolCount = await factory.allPoolsLength();
            const poolPromises: Promise<Pool>[] = [];

            for (let i = 0; i < Number(poolCount); i++) {
                poolPromises.push(loadPoolData(provider, factory, i));
            }

            const poolData = await Promise.all(poolPromises);
            setPools(poolData);
        } catch (error) {
            console.error("Error loading pools:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPools();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadPoolData = async (
        provider: ethers.BrowserProvider,
        factory: ethers.Contract,
        index: number
    ): Promise<Pool> => {
        const poolAddress = await factory.allPools(index);
        const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);

        const [token0, token1, reserves] = await Promise.all([
            pool.token0(),
            pool.token1(),
            pool.getReserves(),
        ]);

        const token0Contract = new ethers.Contract(token0, ERC20_ABI, provider);
        const token1Contract = new ethers.Contract(token1, ERC20_ABI, provider);

        const [token0Symbol, token1Symbol] = await Promise.all([
            token0Contract.symbol().catch(() => "TKN0"),
            token1Contract.symbol().catch(() => "TKN1"),
        ]);

        return {
            address: poolAddress,
            token0,
            token1,
            reserve0: ethers.formatUnits(reserves[0], 18),
            reserve1: ethers.formatUnits(reserves[1], 18),
            token0Symbol,
            token1Symbol,
        };
    };

    if (loading) {
        return (
            <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-gray-600">Loading pools...</p>
            </div>
        );
    }

    if (pools.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                <p>No pools found. Create your first pool!</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-4">Liquidity Pools</h2>
            <div className="grid gap-4">
                {pools.map((pool, index) => (
                    <div
                        key={index}
                        className="border rounded-lg p-4 hover:shadow-lg transition"
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-semibold text-lg">
                                    {pool.token0Symbol} / {pool.token1Symbol}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {pool.address.slice(0, 10)}...{pool.address.slice(-8)}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm">
                                    <span className="font-medium">{pool.reserve0}</span> {pool.token0Symbol}
                                </p>
                                <p className="text-sm">
                                    <span className="font-medium">{pool.reserve1}</span> {pool.token1Symbol}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedPoolAddress(pool.address)}
                            className="mt-3 inline-block text-blue-500 hover:text-blue-600 text-sm font-medium"
                        >
                            View Details →
                        </button>
                    </div>
                ))}
            </div>
            {selectedPoolAddress && (
                <PoolDetails
                    poolAddress={selectedPoolAddress}
                    onClose={() => setSelectedPoolAddress(null)}
                />
            )}
        </div>
    );
}

