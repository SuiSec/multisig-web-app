// SPDX-License-Identifier: Apache-2.0
// Portions adapted from Mysten Labs' Sagat (Apache-2.0).

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function shortenAddress(
	addr: string,
	chars = 6,
): string {
	if (!addr) return '';
	if (addr.length <= chars * 2 + 2) return addr;
	return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}
