import {spawn} from 'child_process';

export const executeCommandInBash = (input: string) => {
	return new Promise((resolve, reject) => {
		const process = spawn('bash', ['-c', input], {
			stdio: 'inherit',
		});

		process.on('close', () => {
			resolve(undefined);
		});
	});
};
