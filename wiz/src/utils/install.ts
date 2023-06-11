import {createWriteStream, existsSync} from 'fs';
import {chmod, mkdir, writeFile} from 'fs/promises';
import * as https from 'https';
import {homedir} from 'os';
import path from 'path';

export async function downloadBinary() {
	// Download the binary from github
	// e.g. https://github.com/fomalhautb/wiz/releases/download/v0.0.0-alpha.0/wiz-server-darwin-arm64
	// Save it to ~/.wiz/wiz-server

	const binaryPath = path.join(homedir(), '.wiz', 'wiz-server');
	if (existsSync(binaryPath)) {
		return;
	}

	const version = 'v0.0.0-alpha.0';
	const variant = 'darwin-arm64';

	const url = `https://github.com/fomalhautb/wiz/releases/download/${version}/wiz-server-${variant}`;

	console.log(`Downloading binary from ${url}...`);
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to download binary from ${url}`);
	}

	const buffer = await response.arrayBuffer();
	const binary = new Uint8Array(buffer);

	await mkdir(path.dirname(binaryPath), {recursive: true});
	await writeFile(binaryPath, binary);

	// chmod +x ~/.wiz/wiz-server
	await chmod(binaryPath, 0o755);
}

export async function downloadModel() {
	// Download model from huggingface
	// e.g. https://huggingface.co/lukasmoeller/replit-code-v1-3b-ggml/resolve/main/ggml-model-q4-0.bin
	// Save it to ~/.wiz/model.bin

	const modelPath = path.join(homedir(), '.wiz', 'model.bin');
	if (existsSync(modelPath)) {
		return;
	}

	const url =
		'https://huggingface.co/lukasmoeller/replit-code-v1-3b-ggml/resolve/main/ggml-model-q4-0.bin';

	const resp = await fetch(url, {
		redirect: 'manual',
	});

	if (resp.status !== 302) {
		throw new Error(`Failed to download model from ${url}`);
	}

	const redirectUrl = resp.headers.get('location') ?? '';

	console.log(`Downloading model from ${url}...`);
	const file = createWriteStream(modelPath);
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
				process.stdout.write(`\rDownloading model: ${percent}%`);
			});

			file.on('finish', () => {
				file.close();

				resolve(void 0);
			});
		}),
	);
}
