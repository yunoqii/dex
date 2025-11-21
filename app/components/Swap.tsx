"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACTS, POOL_ABI, ERC20_ABI, FACTORY_ABI } from "../config";
import PoolSelector from "./PoolSelector";
import { useToast } from "../contexts/ToastContext";

export interface Pool {
    address: string;
    token0: string;
    token1: string;
    token0Symbol: string;
    token1Symbol: string;
}

export default function Swap() {
    const [pools, setPools] = useState<Pool[]>([]);
    const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
    const [tokenIn, setTokenIn] = useState<string>("");
    const [tokenOut, setTokenOut] = useState<string>("");
    const [tokenInSymbol, setTokenInSymbol] = useState<string>("");
    const [tokenOutSymbol, setTokenOutSymbol] = useState<string>("");
    const [amountIn, setAmountIn] = useState("");
    const [amountOut, setAmountOut] = useState("");
    const [slippage, setSlippage] = useState("1"); // Default 1% slippage
    const [loading, setLoading] = useState(false);
    const [poolsLoading, setPoolsLoading] = useState(true);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handlePoolSelect = (pool: Pool) => {
        setSelectedPool(pool);
        // Default: token0 -> token1
        setTokenIn(pool.token0);
        setTokenOut(pool.token1);
        setTokenInSymbol(pool.token0Symbol);
        setTokenOutSymbol(pool.token1Symbol);
        setAmountIn("");
        setAmountOut("");
    };

    const handleSwapDirection = () => {
        if (!selectedPool) return;
        // Swap the direction
        const newTokenIn = tokenIn === selectedPool.token0 ? selectedPool.token1 : selectedPool.token0;
        const newTokenOut = tokenOut === selectedPool.token0 ? selectedPool.token1 : selectedPool.token0;
        const newTokenInSymbol = tokenInSymbol === selectedPool.token0Symbol ? selectedPool.token1Symbol : selectedPool.token0Symbol;
        const newTokenOutSymbol = tokenOutSymbol === selectedPool.token0Symbol ? selectedPool.token1Symbol : selectedPool.token0Symbol;

        setTokenIn(newTokenIn);
        setTokenOut(newTokenOut);
        setTokenInSymbol(newTokenInSymbol);
        setTokenOutSymbol(newTokenOutSymbol);
        setAmountIn("");
        setAmountOut("");
    };

    const calculateOutput = async () => {
        if (!selectedPool || !amountIn || !tokenIn || !tokenOut) return;

        if (!window.ethereum) return;
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const pool = new ethers.Contract(selectedPool.address, POOL_ABI, provider);

            const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
            const tokenOutContract = new ethers.Contract(tokenOut, ERC20_ABI, provider);
            const [decimals, tokenOutDecimals] = await Promise.all([
                tokenInContract.decimals(),
                tokenOutContract.decimals(),
            ]);

            const amountInWei = ethers.parseUnits(amountIn, decimals);

            // Get reserves
            const reserves = await pool.getReserves();
            const reserveToken0 = reserves[0];
            const reserveToken1 = reserves[1];

            // Determine which reserve is which
            const poolToken0 = await pool.token0();
            const reserveTokenIn = tokenIn === poolToken0 ? reserveToken0 : reserveToken1;
            const reserveTokenOut = tokenOut === poolToken0 ? reserveToken0 : reserveToken1;

            // Check if reserves are sufficient
            if (reserveTokenIn === BigInt(0) || reserveTokenOut === BigInt(0)) {
                setAmountOut("0");
                return;
            }

            // AMM formula: amountOut = (amountIn * reserveTokenOut) / (reserveTokenIn + amountIn)
            const amountOutWei = (amountInWei * reserveTokenOut) / (reserveTokenIn + amountInWei);

            // Apply fee (2.5% = 250 basis points)
            // Fee is calculated on the swap amount, so we subtract it from output
            const feeBps = BigInt(250); // 2.5%
            const feeAmount = (amountOutWei * feeBps) / BigInt(10000);
            const amountOutAfterFee = amountOutWei > feeAmount ? amountOutWei - feeAmount : BigInt(0);

            // Format to 3 decimal places
            const amountOutFormatted = parseFloat(ethers.formatUnits(amountOutAfterFee, tokenOutDecimals)).toFixed(3);
            setAmountOut(amountOutFormatted);
        } catch (error) {
            console.error("Error calculating output:", error);
            setAmountOut("0");
        }
    };

    useEffect(() => {
        if (amountIn && selectedPool && tokenIn && tokenOut) {
            calculateOutput();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [amountIn, selectedPool, tokenIn, tokenOut]);

    const handleSwap = async () => {
        if (!selectedPool || !amountIn || !tokenIn || !tokenOut) {
            alert("Please select a pool and enter amount");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            alert("Please install MetaMask!");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, signer);
            const decimals = await tokenInContract.decimals();
            const amountInWei = ethers.parseUnits(amountIn, decimals);

            // Check and approve
            const allowance = await tokenInContract.allowance(await signer.getAddress(), selectedPool.address);
            if (allowance < amountInWei) {
                const approveTx = await tokenInContract.approve(selectedPool.address, ethers.MaxUint256);
                await approveTx.wait();
            }

            const pool = new ethers.Contract(selectedPool.address, POOL_ABI, signer);
            const tokenOutContract = new ethers.Contract(tokenOut, ERC20_ABI, signer);
            const tokenOutDecimals = await tokenOutContract.decimals();

            // Get the sender address (the user's wallet)
            const senderAddress = await signer.getAddress();

            // Calculate minAmountOut based on slippage tolerance
            const estimatedOutWei = ethers.parseUnits(amountOut || "0", tokenOutDecimals);
            const slippagePercent = parseFloat(slippage) || 1;
            const slippageTolerance = BigInt(100 - slippagePercent);
            const minAmountOut = (estimatedOutWei * slippageTolerance) / BigInt(100);

            // Call swap with sender address as first parameter
            const tx = await pool.swap(senderAddress, tokenIn, tokenOut, amountInWei, minAmountOut);
            await tx.wait();

            showToast("Swap successful!", "success");
            setAmountIn("");
            setAmountOut("");
        } catch (error) {
            console.error("Swap error:", error);
            let message = "Unknown error";

            if (error && typeof error === "object") {
                const err = error as { reason?: string; data?: string; message?: string };
                if (err.reason) {
                    message = err.reason;
                } else if (err.data) {
                    // Try to decode the revert reason
                    try {
                        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], err.data);
                        message = decoded[0];
                    } catch {
                        message = err.message || "Transaction reverted";
                    }
                } else if (err.message) {
                    message = err.message;
                }
            } else if (error instanceof Error) {
                message = error.message;
            }

            showToast(`Swap failed: ${message}`, "error");
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
                <h2 className="text-2xl font-bold mb-6">Swap Tokens</h2>
                <div className="text-center py-8 text-gray-500">
                    <p>No pools found. Create a pool first!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-6">Swap Tokens</h2>

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
                        </div>

                        <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                                <label className="block text-sm font-medium flex-1">From</label>
                                <button
                                    onClick={handleSwapDirection}
                                    className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                                    title="Swap direction"
                                >
                                    ⇅ Swap
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={tokenInSymbol}
                                    readOnly
                                    className="w-32 px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-center font-medium"
                                />
                                <input
                                    type="number"
                                    value={amountIn}
                                    onChange={(e) => setAmountIn(e.target.value)}
                                    placeholder="0.0"
                                    step="any"
                                    className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">To</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={tokenOutSymbol}
                                    readOnly
                                    className="w-32 px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-center font-medium"
                                />
                                <input
                                    type="text"
                                    value={amountOut || ""}
                                    readOnly
                                    placeholder="0.0"
                                    className="flex-1 px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700"
                                />
                            </div>
                        </div>

                        {amountOut && (
                            <>
                                <div className="p-3 bg-green-50 dark:bg-green-900 rounded">
                                    <p className="text-sm text-green-700 dark:text-green-300">
                                        Estimated output: {parseFloat(amountOut || "0").toFixed(3)} {tokenOutSymbol}
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Slippage Tolerance (%)
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSlippage("0.1")}
                                            className="px-3 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            0.1%
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSlippage("0.5")}
                                            className="px-3 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            0.5%
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSlippage("1")}
                                            className="px-3 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            1%
                                        </button>
                                        <input
                                            type="number"
                                            value={slippage}
                                            onChange={(e) => setSlippage(e.target.value)}
                                            placeholder="Custom"
                                            step="0.1"
                                            min="0"
                                            max="50"
                                            className="flex-1 px-3 py-1 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Minimum output: {amountOut ? (parseFloat(amountOut) * (100 - parseFloat(slippage || "1")) / 100).toFixed(3) : "0"} {tokenOutSymbol}
                                    </p>
                                </div>
                            </>
                        )}

                        <button
                            onClick={handleSwap}
                            disabled={!amountIn || loading}
                            className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                        >
                            {loading ? "Processing..." : `Swap ${tokenInSymbol} for ${tokenOutSymbol}`}
                        </button>
                    </>
                )}

                {!selectedPool && (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900 rounded">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            Please select a pool to start swapping
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
