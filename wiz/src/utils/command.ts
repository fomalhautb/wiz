import {exec} from 'child_process';

export const runCommand = (command: string) => {
	exec(command, (error, stdout, stderr) => {
		if (error) {
			console.error(`Error executing command: ${error.message}`);
			return;
		}

		if (stdout) {
			console.log(`Command output:\n${stdout}`);
		}

		if (stderr) {
			console.error(`Command error:\n${stderr}`);
		}
	});
}