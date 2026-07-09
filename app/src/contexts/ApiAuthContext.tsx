// SPDX-License-Identifier: Apache-2.0
// Auth wiring adapted from Mysten Labs' Sagat (Apache-2.0). UI is our own.

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import {
	defaultExpiry,
	PersonalMessages,
	type Address,
	type AuthCheckResponse,
} from '@mysten/sagat';
import {
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import React, {
	createContext,
	useContext,
	useEffect,
} from 'react';
import { toast } from 'sonner';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

interface ApiAuthContextType {
	isAuthenticated: boolean;
	authenticatedAddresses: string[];
	isCheckingAuth: boolean;
	currentAddress: Address | null;
	isCurrentAddressAuthenticated: boolean;
	signAndConnect: () => Promise<void>;
	disconnect: () => Promise<void>;
	isConnecting: boolean;
	isDisconnecting: boolean;
}

const ApiAuthContext = createContext<
	ApiAuthContextType | undefined
>(undefined);

const AUTH_QUERY_KEY = [QueryKeys.Auth, 'check'] as const;

export function ApiAuthProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const currentAccount = useCurrentAccount();

	const {
		data: authData,
		isLoading: isCheckingAuth,
		refetch: refetchAuth,
	} = useQuery<AuthCheckResponse>({
		queryKey: [...AUTH_QUERY_KEY, currentAccount?.address],
		queryFn: () => apiClient.checkAuth(),
		retry: false,
		refetchOnWindowFocus: true,
	});

	useEffect(() => {
		refetchAuth();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentAccount?.address]);

	const connectMutation = useMutation({
		mutationFn: async () => {
			if (!currentAccount)
				throw new Error('No wallet connected');
			const expiry = defaultExpiry();
			const signResult = await dappKit.signPersonalMessage({
				message: new TextEncoder().encode(
					PersonalMessages.connect(expiry),
				),
			});
			return apiClient.connect(
				signResult.signature,
				expiry,
			);
		},
		onSuccess: async () => {
			await refetchAuth();
			await queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			await queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.success('Address ownership verified');
		},
		onError: (error: Error) => {
			toast.error(
				`Authentication failed: ${error.message}`,
			);
		},
	});

	const disconnectMutation = useMutation({
		mutationFn: () => apiClient.disconnect(),
		onSuccess: async () => {
			queryClient.clear();
			await refetchAuth();
			toast.success('Disconnected');
		},
		onError: (error: Error) => {
			toast.error(`Disconnect failed: ${error.message}`);
		},
	});

	const currentAddress =
		authData?.addresses?.find(
			(x) => x.address === currentAccount?.address,
		) || null;

	const value: ApiAuthContextType = {
		isAuthenticated: authData?.authenticated ?? false,
		authenticatedAddresses:
			authData?.addresses?.map((x) => x.address) ?? [],
		isCheckingAuth,
		currentAddress,
		isCurrentAddressAuthenticated: !!currentAddress,
		signAndConnect: async () => {
			await connectMutation.mutateAsync();
		},
		disconnect: async () => {
			await disconnectMutation.mutateAsync();
		},
		isConnecting: connectMutation.isPending,
		isDisconnecting: disconnectMutation.isPending,
	};

	return (
		<ApiAuthContext.Provider value={value}>
			{children}
		</ApiAuthContext.Provider>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApiAuth() {
	const context = useContext(ApiAuthContext);
	if (!context)
		throw new Error(
			'useApiAuth must be used within ApiAuthProvider',
		);
	return context;
}
