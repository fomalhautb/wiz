import React from 'react';
import Selection  from './components/Selection.js';
import { Box, Text } from 'ink';
import Divider from './components/Devider.js';
import SyntaxHighlight from './components/SyntaxHighlight.js';
import EmptyLine from './components/EmptyLine.js';

type Props = {
	prompt: string,
};

export default function App({ prompt } : Props) {
	return (
		<Box flexDirection='column' borderStyle={'round'} borderColor={'grey'} paddingX={1}>
			<Divider text={'Prompts'}/>
			<EmptyLine />
			<Text>{prompt}</Text>
			<EmptyLine />
			<Divider text={'Generated Query'}/>
			<EmptyLine />
			<SyntaxHighlight code={`git config --global alias.ac '!git add -A && git commit -m'`} language={'bash'} />
			<EmptyLine />
			<Divider text={'Actions'}/>
			<EmptyLine />
			<Selection items={[
				{text: '✅ Execute command'}, 
				{text: '🎯 Revise query'},
				{text: '📝 Edit myself'},
				{text: '❌ Cancel'}
			]} />
			<EmptyLine />
		</Box>
	);
}
