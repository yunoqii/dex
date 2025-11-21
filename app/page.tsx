"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import WalletButton from "./components/WalletButton";
import PoolList from "./components/PoolList";
import Swap from "./components/Swap";
import AddLiquidity from "./components/AddLiquidity";
import CreatePool from "./components/CreatePool";
import FeeManagerComponent from "./components/FeeManager";
import AccessManagerComponent from "./components/AccessManager";
import VaultMultisigComponent from "./components/VaultMultisig";
import { CONTRACTS, ROLES } from "./config";

type Tab = "pools" | "swap" | "add" | "create" | "fees" | "access" | "vault";

const ACCESS_MANAGER_ABI = [
    "function hasRole(bytes32 role, address account) view returns (bool)",
] as const;

const FEE_MANAGER_ABI = [
    "function hasRole(bytes32 role, address account) view returns (bool)",
] as const;

export default function Home() {
    const [activeTab, setActiveTab] = useState<Tab>("pools");
    const [hasCreatePoolAccess, setHasCreatePoolAccess] = useState<boolean | null>(null);
    const [hasFeeManagerAccess, setHasFeeManagerAccess] = useState<boolean | null>(null);
    const [hasAccessManagerAccess, setHasAccessManagerAccess] = useState<boolean | null>(null);
    const [hasVaultMultisigAccess, setHasVaultMultisigAccess] = useState<boolean | null>(null);
    const [hasAddLiquidityAccess, setHasAddLiquidityAccess] = useState<boolean | null>(null);

    const checkAdminRoles = useCallback(async () => {
        if (typeof window.ethereum === "undefined") {
            setHasCreatePoolAccess(false);
            setHasFeeManagerAccess(false);
            setHasAccessManagerAccess(false);
            setHasVaultMultisigAccess(false);
            setHasAddLiquidityAccess(false);
            return;
        }

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();

            // Check AccessManager roles
            const accessManager = new ethers.Contract(CONTRACTS.ACCESS_MANAGER, ACCESS_MANAGER_ABI, provider);
            const [hasDefaultAdmin, hasMultisigAdmin, hasAdminRole] = await Promise.all([
                accessManager.hasRole(ROLES.DEFAULT_ADMIN_ROLE, userAddress).catch(() => false),
                accessManager.hasRole(ROLES.MULTISIG_ADMIN_ROLE, userAddress).catch(() => false),
                accessManager.hasRole(ROLES.ADMIN_ROLE, userAddress).catch(() => false),
            ]);

            // Check FeeManager role
            const feeManager = new ethers.Contract(CONTRACTS.FEE_MANAGER, FEE_MANAGER_ABI, provider);
            const hasFeeManagerAdmin = await feeManager.hasRole(ROLES.DEFAULT_ADMIN_ROLE, userAddress).catch(() => false);

            setHasCreatePoolAccess(hasDefaultAdmin);
            setHasFeeManagerAccess(hasFeeManagerAdmin);
            setHasAccessManagerAccess(hasDefaultAdmin);
            setHasVaultMultisigAccess(hasMultisigAdmin);
            setHasAddLiquidityAccess(hasAdminRole);
        } catch (error) {
            console.error("Error checking admin roles:", error);
            setHasCreatePoolAccess(false);
            setHasFeeManagerAccess(false);
            setHasAccessManagerAccess(false);
            setHasVaultMultisigAccess(false);
            setHasAddLiquidityAccess(false);
        }
    }, []);

    useEffect(() => {
        checkAdminRoles();

        // Re-check when account changes
        if (typeof window.ethereum !== "undefined") {
            const ethereum = window.ethereum;
            ethereum.on("accountsChanged", checkAdminRoles);
            return () => {
                ethereum.removeListener("accountsChanged", checkAdminRoles);
            };
        }
    }, [checkAdminRoles]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            DEX Platform
                        </h1>
                        <div className="flex items-center gap-4">
                            <a
                                href="https://github.com/yunoqii/dex"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                                aria-label="GitHub Repository"
                            >
                                <svg
                                    className="w-6 h-6"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </a>
                            <WalletButton />
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation Tabs */}
            <nav className="bg-white dark:bg-gray-800 border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex space-x-8">
                        <button
                            onClick={() => setActiveTab("pools")}
                            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "pools"
                                ? "border-blue-500 text-blue-600"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                }`}
                        >
                            Pools
                        </button>
                        <button
                            onClick={() => setActiveTab("swap")}
                            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "swap"
                                ? "border-blue-500 text-blue-600"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                }`}
                        >
                            Swap
                        </button>
                        {hasAddLiquidityAccess === true && (
                            <button
                                onClick={() => setActiveTab("add")}
                                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "add"
                                    ? "border-blue-500 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                            >
                                Add Liquidity
                            </button>
                        )}
                        {hasCreatePoolAccess === true && (
                            <button
                                onClick={() => setActiveTab("create")}
                                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "create"
                                    ? "border-blue-500 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                            >
                                Create Pool
                            </button>
                        )}
                        {hasFeeManagerAccess === true && (
                            <button
                                onClick={() => setActiveTab("fees")}
                                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "fees"
                                    ? "border-blue-500 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                            >
                                Fee Manager
                            </button>
                        )}
                        {hasAccessManagerAccess === true && (
                            <button
                                onClick={() => setActiveTab("access")}
                                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "access"
                                    ? "border-blue-500 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                            >
                                Access Manager
                            </button>
                        )}
                        {hasVaultMultisigAccess === true && (
                            <button
                                onClick={() => setActiveTab("vault")}
                                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "vault"
                                    ? "border-blue-500 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                            >
                                Vault Multisig
                            </button>
                        )}
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {activeTab === "pools" && <PoolList />}
                {activeTab === "swap" && <Swap />}
                {activeTab === "add" && hasAddLiquidityAccess === true && <AddLiquidity />}
                {activeTab === "create" && hasCreatePoolAccess === true && <CreatePool />}
                {activeTab === "fees" && hasFeeManagerAccess === true && <FeeManagerComponent />}
                {activeTab === "access" && hasAccessManagerAccess === true && <AccessManagerComponent />}
                {activeTab === "vault" && hasVaultMultisigAccess === true && <VaultMultisigComponent />}
                {/* Redirect to pools if user tries to access admin tab without permission */}
                {(activeTab === "add" && hasAddLiquidityAccess === false) ||
                    (activeTab === "create" && hasCreatePoolAccess === false) ||
                    (activeTab === "fees" && hasFeeManagerAccess === false) ||
                    (activeTab === "access" && hasAccessManagerAccess === false) ||
                    (activeTab === "vault" && hasVaultMultisigAccess === false) ? (
                    <div className="text-center py-12">
                        <p className="text-red-600 dark:text-red-400 font-semibold">
                            Access Denied: You don&apos;t have the required admin role for this section.
                        </p>
                        <button
                            onClick={() => setActiveTab("pools")}
                            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        >
                            Go to Pools
                        </button>
                    </div>
                ) : null}
            </main>

            {/* Footer */}
            <footer className="bg-white dark:bg-gray-800 border-t mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <p className="text-center text-gray-500 text-sm italic">
                        a minimal dex on Sepolia by yunoqii
                    </p>
                </div>
            </footer>
        </div>
    );
}
