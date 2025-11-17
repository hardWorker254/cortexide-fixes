import { URI } from '../../../../base/common/uri.js';

export type CortexideDirectoryItem = {
	uri: URI;
	name: string;
	isSymbolicLink: boolean;
	children: CortexideDirectoryItem[] | null;
	isDirectory: boolean;
	isGitIgnoredDirectory: false | { numChildren: number }; // if directory is gitignored, we ignore children
}
