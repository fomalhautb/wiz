import React, {useEffect} from 'react';
import {useRouteStore} from './states/router.js';
import PromptingPage from './pages/PromptingPage.js';
import {Text} from 'ink';
import {getConfig} from './utils/config.js';
import SetupPage from './pages/SetupPage.js';
import CompletionPage from './pages/CompletionPage.js';

type Props = {
	prompt: string;
};

export default function App({prompt}: Props) {
	const currentRoute = useRouteStore(state => state.current);
	const replaceRoute = useRouteStore(state => state.replace);
	const pushRoute = useRouteStore(state => state.push);

	useEffect(() => {
		if (prompt.trim() === '') {
			replaceRoute('completion');
		} else {
			replaceRoute('prompting');
		}

		if (!getConfig('openai_key')) {
			pushRoute('setup');
		}
	}, [prompt]);

	if (currentRoute === 'loading') {
		return null;
	} else if (currentRoute === 'prompting') {
		return <PromptingPage prompt={prompt} />;
	} else if (currentRoute === 'completion') {
		return <CompletionPage />;
	} else if (currentRoute === 'setup') {
		return <SetupPage />;
	} else if (currentRoute === 'setting') {
		return <Text>Setting</Text>;
	} else {
		return <Text>404</Text>;
	}
}
