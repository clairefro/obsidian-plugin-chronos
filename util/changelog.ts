export interface GitHubRelease {
	tag_name: string;
	body?: string | null;
	published_at: string;
}

interface ChangelogEntry {
	version: string;
	date: string;
	content: string;
}

function isPatchRelease(version: string): boolean {
	const patch = version.split(".")[2];
	return patch !== undefined && parseInt(patch, 10) > 0;
}

function hasIncludeComment(body: string | null | undefined): boolean {
	return (
		body
			?.trim()
			.toLowerCase()
			.replace(/\s+/g, "")
			.startsWith("<!--include-->") ?? false
	);
}

function compareVersions(v1: string, v2: string): number {
	const parts1 = v1.split(".").map((part) => parseInt(part, 10));
	const parts2 = v2.split(".").map((part) => parseInt(part, 10));

	for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
		const part1 = parts1[i] || 0;
		const part2 = parts2[i] || 0;

		if (part1 > part2) return 1;
		if (part1 < part2) return -1;
	}

	return 0;
}

export function getUnseenChangelogs(
	releases: GitHubRelease[],
	lastSeenVersion: string,
	currentVersion: string,
): ChangelogEntry[] {
	const unseenEntries: ChangelogEntry[] = [];

	for (const release of releases) {
		const version = release.tag_name.replace(/^v/, "");
		const included = hasIncludeComment(release.body);
		if (isPatchRelease(version) && !included) {
			continue;
		}

		if (
			compareVersions(version, lastSeenVersion) > 0 &&
			compareVersions(version, currentVersion) <= 0
		) {
			const content = included
				? release.body?.replace(/^\s*<!--[\s\S]*?-->/, "")
				: release.body;
			unseenEntries.push({
				version,
				date: release.published_at,
				content: content?.trim()
					? content
					: "No release notes available.",
			});
		}
	}

	unseenEntries.sort((a, b) => {
		return new Date(b.date).getTime() - new Date(a.date).getTime();
	});

	return unseenEntries.slice(0, 4);
}
