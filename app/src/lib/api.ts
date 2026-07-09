// SPDX-License-Identifier: Apache-2.0

import { SagatClient } from '@mysten/sagat';

const API_BASE_URL =
	import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Cookie-mode: the relay is an untrusted coordination server. It never holds
// keys and can never sign — auth is a JWT cookie proving address ownership.
export const apiClient = new SagatClient(
	API_BASE_URL,
	'cookie',
);
