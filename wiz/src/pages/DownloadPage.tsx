import React, { useState } from 'react';
import {Text, Box} from 'ink';
import { downloadBinary, downloadModel } from '../utils/install.js';
import ProgressBar from '../components/ProgressBar.js';

const SetupPage = () => {
	const [percentage, setPercentage] = useState(0);

	React.useEffect(() => {
		downloadBinary();
		downloadModel(setPercentage);
	}, []);

	// TODO: remove file if download not finished and the user cancels the download

	return (
		<Box flexDirection='row'>
			<Text color='green'>Downloading model: </Text>
			<ProgressBar value={percentage} />
			<Text> {percentage}%</Text>
		</Box>
	);
};

export default SetupPage;
