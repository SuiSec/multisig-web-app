// SPDX-License-Identifier: Apache-2.0
// BYOK key storage + the DeepSeek explain mutation.
//
// The key lives ONLY in this browser. Two storage modes:
//   • persist=true  → localStorage  (remembered across sessions)
//   • persist=false → sessionStorage (cleared when the tab closes)
// Either way it never reaches our relay, the bundle, or git. localStorage is
// readable by same-origin JS, so users worried about XSS should keep persist
// off and/or use a spend-capped, rotatable DeepSeek key.

import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import {
	explainTransaction,
	type TxExplainInput,
} from '../lib/deepseek';

const KEY_NAME = 'msw:deepseek-key';

function readKey(): string {
	return (
		localStorage.getItem(KEY_NAME) ??
		sessionStorage.getItem(KEY_NAME) ??
		''
	);
}

function readPersisted(): boolean {
	return localStorage.getItem(KEY_NAME) !== null;
}

/** Reactive access to the stored DeepSeek key + how it's persisted. */
export function useDeepseekKey() {
	const [key, setKeyState] = useState(readKey);
	const [persist, setPersistState] =
		useState(readPersisted);

	const save = useCallback(
		(next: string, nextPersist: boolean) => {
			// Clear both stores first so we never leave a stale copy behind.
			localStorage.removeItem(KEY_NAME);
			sessionStorage.removeItem(KEY_NAME);
			const trimmed = next.trim();
			if (trimmed)
				(nextPersist
					? localStorage
					: sessionStorage
				).setItem(KEY_NAME, trimmed);
			setKeyState(trimmed);
			setPersistState(nextPersist);
		},
		[],
	);

	const clear = useCallback(() => {
		localStorage.removeItem(KEY_NAME);
		sessionStorage.removeItem(KEY_NAME);
		setKeyState('');
	}, []);

	return { key, persist, save, clear };
}

export function useExplainTransaction() {
	return useMutation({
		mutationFn: ({
			apiKey,
			input,
		}: {
			apiKey: string;
			input: TxExplainInput;
		}) => explainTransaction(apiKey, input),
		retry: false,
	});
}
