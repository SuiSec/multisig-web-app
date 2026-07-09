// SPDX-License-Identifier: Apache-2.0
// Reusable object thumbnail: renders a Sui Display image when present, else a
// deterministic identicon (InitialBadge). Shared by the assets ObjectsGrid and
// the transaction-effects view so an object looks the same everywhere.

import { InitialBadge } from './ui/kit';

export function ObjectThumb({
	id,
	label,
	imageUrl,
	size = 40,
	/** Fill the parent (aspect-square) instead of a fixed pixel size. */
	fill = false,
	className = '',
}: {
	id: string;
	label: string;
	imageUrl: string | null;
	size?: number;
	fill?: boolean;
	className?: string;
}) {
	if (imageUrl)
		return (
			<img
				src={imageUrl}
				alt={label}
				loading="lazy"
				style={
					fill ? undefined : { width: size, height: size }
				}
				className={
					fill
						? `h-full w-full object-cover ${className}`
						: `flex-none rounded-lg object-cover ${className}`
				}
				onError={(e) => {
					e.currentTarget.style.display = 'none';
				}}
			/>
		);
	return (
		<InitialBadge
			seed={id}
			label={label}
			size={fill ? 64 : size}
			className={
				fill ? className : `rounded-lg ${className}`
			}
		/>
	);
}
