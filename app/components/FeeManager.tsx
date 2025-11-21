"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACTS } from "../config";
import { useToast } from "../contexts/ToastContext";

const FEE_MANAGER_ABI = [
    "function fee() view returns (uint256)",
    "function FEE_DENOMINATOR() view returns (uint256)",
    "function setFee(uint256 _fee) external",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
];

export default function FeeManagerComponent() {
    const [currentFee, setCurrentFee] = useState<string>("");
    const [newFee, setNewFee] = useState("");
    const [feeDenominator, setFeeDenominator] = useState<string>("");
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);
    const { showToast } = useToast();

    const loadFeeData = useCallback(async () => {
        if (typeof window.ethereum === "undefined") {
            setDataLoading(false);
            return;
        }

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const feeManager = new ethers.Contract(CONTRACTS.FEE_MANAGER, FEE_MANAGER_ABI, provider);

            const [fee, denominator] = await Promise.all([
                feeManager.fee(),
                feeManager.FEE_DENOMINATOR(),
            ]);

            setCurrentFee(fee.toString());
            setFeeDenominator(denominator.toString());

            // Check admin role
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();
            const DEFAULT_ADMIN_ROLE = await feeManager.DEFAULT_ADMIN_ROLE();
            const hasRole = await feeManager.hasRole(DEFAULT_ADMIN_ROLE, userAddress);
            setIsAdmin(hasRole);
        } catch (error) {
            console.error("Error loading fee data:", error);
            showToast("Failed to load fee data", "error");
        } finally {
            setDataLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadFeeData();
    }, [loadFeeData]);

    const handleSetFee = async () => {
        if (!newFee || isNaN(parseFloat(newFee))) {
            showToast("Please enter a valid fee", "warning");
            return;
        }

        const feeValue = parseFloat(newFee);
        if (feeValue < 0 || feeValue > 100) {
            showToast("Fee must be between 0 and 100", "warning");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        if (isAdmin === false) {
            showToast("You must have ADMIN_ROLE to set fees", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const feeManager = new ethers.Contract(CONTRACTS.FEE_MANAGER, FEE_MANAGER_ABI, signer);

            // Convert percentage to basis points (e.g., 2.5% = 250 basis points)
            const feeBps = BigInt(Math.round(feeValue * 100));

            const tx = await feeManager.setFee(feeBps);
            showToast("Transaction submitted...", "info");
            await tx.wait();

            showToast("Fee updated successfully!", "success");
            setNewFee("");
            await loadFeeData();
        } catch (error) {
            console.error("Error setting fee:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const feePercentage = currentFee && feeDenominator
        ? (Number(currentFee) / Number(feeDenominator) * 100).toFixed(3)
        : "0";

    if (dataLoading) {
        return (
            <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <p className="mt-2 text-gray-600">Loading fee data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-6">Fee Manager</h2>

            <div className="space-y-6">
                {/* Current Fee Display */}
                <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                        Current Fee
                    </h3>
                    <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                        {feePercentage}%
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                        {currentFee} basis points (out of {feeDenominator})
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Contract: {CONTRACTS.FEE_MANAGER.slice(0, 10)}...{CONTRACTS.FEE_MANAGER.slice(-8)}
                    </p>
                </div>

                {/* Admin Status */}
                {isAdmin === true ? (
                    <div className="p-3 bg-green-50 dark:bg-green-900 rounded">
                        <p className="text-sm text-green-700 dark:text-green-300">
                            ✓ You have ADMIN_ROLE - You can update fees
                        </p>
                    </div>
                ) : isAdmin === false ? (
                    <div className="p-3 bg-red-50 dark:bg-red-900 rounded">
                        <p className="text-sm text-red-700 dark:text-red-300">
                            ✗ You don&apos;t have ADMIN_ROLE - Cannot update fees
                        </p>
                    </div>
                ) : null}

                {/* Set New Fee */}
                {isAdmin === true && (
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Set New Fee (%)
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                value={newFee}
                                onChange={(e) => setNewFee(e.target.value)}
                                placeholder="2.5"
                                step="0.1"
                                min="0"
                                max="100"
                                className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleSetFee}
                                disabled={!newFee || loading}
                                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                            >
                                {loading ? "Updating..." : "Update"}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Enter fee as percentage (e.g., 2.5 for 2.5%)
                        </p>
                    </div>
                )}

                {/* Info */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">About Fees</h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                        <li>• Fee is applied to all swaps</li>
                        <li>• Fee is calculated in basis points (1% = 100 basis points)</li>
                        <li>• Current fee: {feePercentage}%</li>
                        <li>• Only admins can update fees</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

