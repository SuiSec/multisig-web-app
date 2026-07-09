// SPDX-License-Identifier: Apache-2.0
// Thin client for the public Sui GraphQL RPC. The relay never contacts a
// fullnode, so on-chain reads that gRPC can't do (history by address, owned
// objects with Display) go through GraphQL from the browser. Read-only, no key.

const GRAPHQL_ENDPOINT: Record<string, string | undefined> =
	{
		mainnet: 'https://graphql.mainnet.sui.io/graphql',
		testnet: 'https://graphql.testnet.sui.io/graphql',
	};

export function graphqlAvailable(network: string): boolean {
	return !!GRAPHQL_ENDPOINT[network];
}

export async function suiGraphqlRequest<T>(
	network: string,
	query: string,
	variables: Record<string, unknown>,
): Promise<T> {
	const url = GRAPHQL_ENDPOINT[network];
	if (!url)
		throw new Error(
			`On-chain queries aren’t available on ${network} (no Sui GraphQL endpoint).`,
		);

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	});
	if (!res.ok) throw new Error(`Sui GraphQL ${res.status}`);

	const json = (await res.json()) as {
		data?: T;
		errors?: { message: string }[];
	};
	if (json.errors?.length)
		throw new Error(json.errors[0].message);
	if (!json.data)
		throw new Error('Sui GraphQL returned no data.');
	return json.data;
}
