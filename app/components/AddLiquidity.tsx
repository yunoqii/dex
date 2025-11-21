"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACTS, POOL_ABI, ERC20_ABI, FACTORY_ABI } from "../config";
import PoolSelector from "./PoolSelector";
import { Pool } from "./Swap";
import { useToast } from "../contexts/ToastContext";

export default function AddLiquidity() {
    const [pools, setPools] = useState<Pool[]>([]);
    const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
    const [selectedToken, setSelectedToken] = useState<"token0" | "token1" | null>(null);
    const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>("");
    const [selectedTokenSymbol, setSelectedTokenSymbol] = useState<string>("");
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [poolsLoading, setPoolsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [checkingAdmin, setCheckingAdmin] = useState(false);
    const { showToast } = useToast();

    const loadPools = async () => {
        if (typeof window.ethereum === "undefined") {
            setPoolsLoading(false);
            return;
        }

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
            setPoolsLoading(false);
        }
    };

    const loadPoolData = async (
        provider: ethers.BrowserProvider,
        factory: ethers.Contract,
        index: number
    ): Promise<Pool> => {
        const poolAddress = await factory.allPools(index);
        const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);

        const [token0, token1] = await Promise.all([
            pool.token0(),
            pool.token1(),
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
            token0Symbol,
            token1Symbol,
        };
    };

    useEffect(() => {
        loadPools();
        checkAdminRole();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkAdminRole = async () => {
        if (typeof window.ethereum === "undefined" || !selectedPool) {
            setIsAdmin(null);
            return;
        }

        setCheckingAdmin(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();
            const pool = new ethers.Contract(selectedPool.address, POOL_ABI, provider);

            // ADMIN_ROLE = keccak256("ADMIN_ROLE")
            const ADMIN_ROLE = "0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775";
            const hasRole = await pool.hasRole(ADMIN_ROLE, userAddress);
            setIsAdmin(hasRole);
        } catch (error) {
            console.error("Error checking admin role:", error);
            setIsAdmin(false);
        } finally {
            setCheckingAdmin(false);
        }
    };

    useEffect(() => {
        if (selectedPool) {
            checkAdminRole();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPool]);

    const handlePoolSelect = (pool: Pool) => {
        setSelectedPool(pool);
        // Reset token selection when pool changes
        setSelectedToken(null);
        setSelectedTokenAddress("");
        setSelectedTokenSymbol("");
        setAmount("");
    };

    const handleTokenSelect = (token: "token0" | "token1") => {
        if (!selectedPool) return;

        setSelectedToken(token);
        if (token === "token0") {
            setSelectedTokenAddress(selectedPool.token0);
            setSelectedTokenSymbol(selectedPool.token0Symbol);
        } else {
            setSelectedTokenAddress(selectedPool.token1);
            setSelectedTokenSymbol(selectedPool.token1Symbol);
        }
        setAmount("");
    };

    const handleAddLiquidity = async () => {
        if (!selectedPool || !selectedToken || !selectedTokenAddress || !amount) {
            showToast("Please select a pool, token, and enter amount", "warning");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        if (isAdmin === false) {
            showToast("You must have ADMIN_ROLE to add liquidity", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            const tokenContract = new ethers.Contract(selectedTokenAddress, ERC20_ABI, signer);
            const decimals = await tokenContract.decimals();
            const amountWei = ethers.parseUnits(amount, decimals);

            // Check and approve token
            const userAddress = await signer.getAddress();
            const allowance = await tokenContract.allowance(userAddress, selectedPool.address);

            if (allowance < amountWei) {
                const approveTx = await tokenContract.approve(selectedPool.address, ethers.MaxUint256);
                await approveTx.wait();
            }

            // Add liquidity for the selected token
            const pool = new ethers.Contract(selectedPool.address, POOL_ABI, signer);
            const tx = await pool.addLiquidity(selectedTokenAddress, amountWei);
            showToast("Transaction submitted...", "info");
            await tx.wait();

            showToast("Liquidity added successfully!", "success");
            setAmount("");
            setSelectedToken(null);
            setSelectedTokenAddress("");
            setSelectedTokenSymbol("");
        } catch (error) {
            console.error("Add liquidity error:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    if (poolsLoading) {
        return (
            <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <p className="mt-2 text-gray-600">Loading pools...</p>
                </div>
            </div>
        );
    }

    if (pools.length === 0) {
        return (
            <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold mb-6">Add Liquidity</h2>
                <div className="text-center py-8 text-gray-500">
                    <p>No pools found. Create a pool first!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-6">Add Liquidity</h2>

            <div className="space-y-4">
                <PoolSelector
                    pools={pools}
                    selectedPool={selectedPool}
                    onSelect={handlePoolSelect}
                />

                {selectedPool && (
                    <>
                        <div className="p-3 bg-blue-50 dark:bg-blue-900 rounded">
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                Pool: {selectedPool.token0Symbol} / {selectedPool.token1Symbol}
                            </p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                {selectedPool.address.slice(0, 10)}...{selectedPool.address.slice(-8)}
                            </p>
                            {checkingAdmin ? (
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                                    Checking admin role...
                                </p>
                            ) : isAdmin === true ? (
                                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                                    ✓ You have ADMIN_ROLE
                                </p>
                            ) : isAdmin === false ? (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                                    ✗ You don&apos;t have ADMIN_ROLE
                                </p>
                            ) : null}
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Select Token to Add</label>
                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => handleTokenSelect("token0")}
                                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition ${selectedToken === "token0"
                                        ? "border-green-500 bg-green-50 dark:bg-green-900"
                                        : "border-gray-300 hover:border-gray-400"
                                        }`}
                                >
                                    <p className="font-medium">{selectedPool.token0Symbol}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {selectedPool.token0.slice(0, 8)}...{selectedPool.token0.slice(-6)}
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTokenSelect("token1")}
                                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition ${selectedToken === "token1"
                                        ? "border-green-500 bg-green-50 dark:bg-green-900"
                                        : "border-gray-300 hover:border-gray-400"
                                        }`}
                                >
                                    <p className="font-medium">{selectedPool.token1Symbol}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {selectedPool.token1.slice(0, 8)}...{selectedPool.token1.slice(-6)}
                                    </p>
                                </button>
                            </div>
                        </div>

                        {selectedToken && selectedTokenSymbol && (
                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Amount ({selectedTokenSymbol})
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={selectedTokenSymbol}
                                        readOnly
                                        className="w-32 px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-center font-medium"
                                    />
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.0"
                                        step="any"
                                        className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleAddLiquidity}
                            disabled={!selectedToken || !amount || loading || isAdmin === false}
                            className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                        >
                            {loading ? "Processing..." : `Add ${selectedTokenSymbol || "Liquidity"}`}
                        </button>
                    </>
                )}

                {!selectedPool && (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900 rounded">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            Please select a pool to add liquidity
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

