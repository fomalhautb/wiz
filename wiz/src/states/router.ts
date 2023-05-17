import {create} from 'zustand';

type Route = 'generation' | 'setup' | 'setting';

type RouterState = {
	stack: Route[];
	current: Route;
	push: (route: Route) => void;
	pop: () => void;
	replace: (route: Route) => void;
};

export const useRouteStore = create<RouterState>((set, get) => ({
	stack: ['generation'],
	current: 'generation',
	push: route => {
		set(state => ({
			stack: [...state.stack, route],
			current: route,
		}));
	},
	pop: () => {
		if (get().stack.length == 1) return;

		set(state => ({
			stack: state.stack.slice(0, -1),
			current: state.stack[get().stack.length - 2],
		}));
	},
	replace: route => {
		set(state => ({
			stack: [...state.stack.slice(0, -1), route],
			current: route,
		}));
	},
}));
