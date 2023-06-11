import {createWriteStream, existsSync} from 'fs';
import {chmod, mkdir, writeFile} from 'fs/promises';
import * as https from 'https';
import {homedir} from 'os';
import path from 'path';
import fs from 'fs';

const FOLDER_PATH = path.join(homedir(), '.wiz');
if (!existsSync(FOLDER_PATH)) {
	fs.mkdirSync(FOLDER_PATH);
}
const BINARY_PATH = path.join(FOLDER_PATH, 'server');
const MODEL_PATH = path.join(FOLDER_PATH, 'model.bin');

export const checkSetup = () => {
	return existsSync(BINARY_PATH) && existsSync(MODEL_PATH);
};

export const downloadBinary = async () => {
	// Download the binary from github
	// e.g. https://github.com/fomalhautb/wiz/releases/download/v0.0.0-alpha.0/wiz-server-darwin-arm64
	// Save it to ~/.wiz/server

	if (existsSync(BINARY_PATH)) {
		return;
	}

	const version = 'v0.0.2';
	const variant = 'darwin-arm64';

	const url = `https://github.com/fomalhautb/wiz/releases/download/${version}/wiz-server-${variant}`;

	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to download binary from ${url}`);
	}

	const buffer = await response.arrayBuffer();
	const binary = new Uint8Array(buffer);

	await mkdir(path.dirname(BINARY_PATH), {recursive: true});
	await writeFile(BINARY_PATH, binary);

	// chmod +x ~/.wiz/wiz-server
	await chmod(BINARY_PATH, 0o755);
};

export const downloadModel = async (
	percentageCallback?: (percentage: number) => void,
) => {
	// Download model from huggingface
	// e.g. https://huggingface.co/lukasmoeller/replit-code-v1-3b-ggml/resolve/main/ggml-model-q4-0.bin
	// Save it to ~/.wiz/model.bin

	if (existsSync(MODEL_PATH)) {
		return;
	}

	const url =
		'https://huggingface.co/lukasmoeller/replit-code-codeinstruct-v1-3b-ggml/resolve/main/ggml-model-q4-0.bin';

	const resp = await fetch(url, {
		redirect: 'manual',
	});

	if (resp.status !== 302) {
		throw new Error(`Failed to download model from ${url}`);
	}

	const redirectUrl = resp.headers.get('location') ?? '';

	const file = createWriteStream(MODEL_PATH);
	await new Promise((resolve, reject) =>
		https.get(redirectUrl, function (response) {
			response.pipe(file);

			file.on('error', reject);

			// Report download progress
			let total = 0;
			const totalSize = parseInt(response.headers['content-length'] ?? '0', 10);
			response.on('data', chunk => {
				total += chunk.length;
				const percent = Math.round((total / totalSize) * 100);
				percentageCallback?.(percent);
			});

			file.on('finish', () => {
				file.close();

				resolve(void 0);
			});
		}),
	);
};
