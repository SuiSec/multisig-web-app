// SPDX-License-Identifier: Apache-2.0

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

export function ThemedToaster() {
	const { resolvedTheme } = useTheme();
	return (
		<Toaster
			theme={(resolvedTheme as 'light' | 'dark') ?? 'light'}
			position="bottom-right"
		/>
	);
}

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const isDark = resolvedTheme === 'dark';

	return (
		<button
			aria-label="Toggle light / dark theme"
			title="Toggle theme"
			onClick={() => setTheme(isDark ? 'light' : 'dark')}
			className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-accent hover:text-foreground"
		>
			{mounted &&
				(isDark ? (
					<Sun className="h-4 w-4" />
				) : (
					<Moon className="h-4 w-4" />
				))}
		</button>
	);
}
