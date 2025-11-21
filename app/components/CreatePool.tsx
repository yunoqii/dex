"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACTS, FACTORY_ABI } from "../config";
import { useToast } from "../contexts/ToastContext";

const ACCESS_MANAGER = "0xb2f95C43eF4C5CbC167ECF6cD4c17eb92321488b";
const ACCESS_MANAGER_ABI = [
    "function isAdmin(address) view returns (bool)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    "function hasRole(bytes32, address) view returns (bool)",
];

export default function CreatePool() {
    const [token0, setToken0] = useState("");
    const [token0Decimals, setToken0Decimals] = useState("18");
    const [token1, setToken1] = useState("");
    const [token1Decimals, setToken1Decimals] = useState("18");
    const [loading, setLoading] = useState(false);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [checkingAdmin, setCheckingAdmin] = useState(false);
    const { showToast } = useToast();

    const checkAdminRole = useCallback(async () => {
        if (typeof window.ethereum === "undefined") {
            setIsAdmin(null);
            return;
        }

        setCheckingAdmin(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();
            const accessManager = new ethers.Contract(ACCESS_MANAGER, ACCESS_MANAGER_ABI, provider);

            // Check if user has DEFAULT_ADMIN_ROLE (required to create pools)
            const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
            const hasAdminRole = await accessManager.hasRole(DEFAULT_ADMIN_ROLE, userAddress);
            setIsAdmin(hasAdminRole);
        } catch (error) {
            console.error("Error checking admin role:", error);
            setIsAdmin(false);
        } finally {
            setCheckingAdmin(false);
        }
    }, []);

    useEffect(() => {
        checkAdminRole();
    }, [checkAdminRole]);

    const handleCreatePool = async () => {
        if (!token0 || !token1 || token0 === token1) {
            showToast("Please provide valid token addresses", "warning");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        if (isAdmin === false) {
            showToast("You must have ADMIN_ROLE to create pools", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const factory = new ethers.Contract(CONTRACTS.FACTORY, FACTORY_ABI, signer);

            const tx = await factory.createPool(
                token0,
                token0Decimals,
                token1,
                token1Decimals,
                await signer.getAddress()
            );

            showToast("Transaction submitted...", "info");
            await tx.wait();

            showToast("Pool created successfully!", "success");
            setToken0("");
            setToken1("");
        } catch (error) {
            console.error("Create pool error:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-6">Create New Pool</h2>

            {checkingAdmin ? (
                <div className="p-3 bg-blue-50 dark:bg-blue-900 rounded mb-4">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                        Checking admin role...
                    </p>
                </div>
            ) : isAdmin === true ? (
                <div className="p-3 bg-green-50 dark:bg-green-900 rounded mb-4">
                    <p className="text-sm text-green-700 dark:text-green-300">
                        ✓ You have ADMIN_ROLE
                    </p>
                </div>
            ) : isAdmin === false ? (
                <div className="p-3 bg-red-50 dark:bg-red-900 rounded mb-4">
                    <p className="text-sm text-red-700 dark:text-red-300">
                        ✗ You don&apos;t have ADMIN_ROLE. Only admins can create pools.
                    </p>
                </div>
            ) : null}

            {isAdmin === false ? (
                <div className="p-6 text-center text-gray-500">
                    <p>You need DEFAULT_ADMIN_ROLE to create pools.</p>
                    <p className="text-sm mt-2">Please contact an administrator.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Token 0 Address</label>
                        <input
                            type="text"
                            value={token0}
                            onChange={(e) => setToken0(e.target.value)}
                            placeholder="0x..."
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Token 0 Decimals</label>
                        <input
                            type="number"
                            value={token0Decimals}
                            onChange={(e) => setToken0Decimals(e.target.value)}
                            placeholder="18"
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Token 1 Address</label>
                        <input
                            type="text"
                            value={token1}
                            onChange={(e) => setToken1(e.target.value)}
                            placeholder="0x..."
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Token 1 Decimals</label>
                        <input
                            type="number"
                            value={token1Decimals}
                            onChange={(e) => setToken1Decimals(e.target.value)}
                            placeholder="18"
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <button
                        onClick={handleCreatePool}
                        disabled={!token0 || !token1 || loading}
                        className="w-full py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                    >
                        {loading ? "Creating..." : "Create Pool"}
                    </button>
                </div>
            )}
        </div>
    );
}

