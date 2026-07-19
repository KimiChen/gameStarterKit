// @ts-nocheck — vendored 上游源码：上游以非 strict（noImplicitAny:false）编译，本仓库 strict 下误报；字节锁禁改，偏差只此一行（见 README.md）
export {
	createWorld,
	resetWorld,
	deleteWorld,
	getWorldComponents,
	getAllEntities,
	$internal,
} from './World'

export type {
	World,
	InternalWorld,
	WorldContext
} from './World'

export {
	addEntity,
	removeEntity,
	getEntityComponents,
	entityExists,
	Prefab,
	addPrefab,
} from './Entity'

export type {
	EntityId,
} from './Entity'

export { 
	createEntityIndex,
	getId,
	getVersion,
	withVersioning,
} from './EntityIndex'

export {
	registerComponent,
	registerComponents,
	hasComponent,
	addComponent,
	addComponents,
	setComponent,
	removeComponent,
	removeComponents,
	getComponent,
	set
} from './Component'

export type {
	ComponentRef,
	ComponentData
} from './Component'

export {
	commitRemovals,
	removeQuery,
	registerQuery,
	query,
	observe,
	onAdd,
	onRemove,
	Or,
	And,
	Not,
	Any,
	All,
	None,
	onGet,
	onSet,
	Hierarchy,
	Cascade,
	asBuffer,
	isNested,
	noCommit,
} from './Query'

export type {
	ObservableHookDef,
	ObservableHook,
	QueryResult,
	Query,
	QueryOperatorType,
	OpReturnType,
	QueryOperator,
	QueryTerm,
	QueryOptions,
	HierarchyTerm,
	QueryModifier,
} from './Query'

export { pipe } from './utils/pipe'

export {
	withAutoRemoveSubject,
	withOnTargetRemoved,
	withStore,
	createRelation,
	getRelationTargets,
	Wildcard,
	IsA,
	Pair,
	isRelation,
	isWildcard,
} from './Relation'

export type {
	OnTargetRemovedCallback,
	Relation,
	RelationTarget,
} from './Relation'

export {
	getHierarchyDepth,
	getMaxHierarchyDepth,
} from './Hierarchy'
