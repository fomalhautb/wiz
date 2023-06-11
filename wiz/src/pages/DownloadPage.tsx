import React, { useState } from 'react';
import {Text, Box} from 'ink';
import {ProgressBar} from '@inkjs/ui';
import { downloadBinary, downloadModel } from '../utils/install.js';

const SetupPage = () => {
	const [percentage, setPercentage] = useState(0);

	React.useEffect(() => {
		downloadBinary();
		downloadModel(setPercentage);
	}, []);

	// TODO: remove file if download not finished and the user cancels the download

	return (
		<Box flexDirection='row'>
			<Text>Downloading model: </Text>
			<ProgressBar value={percentage} />
			<Text> {percentage}%</Text>
		</Box>
	);
};

export default SetupPage;
