/**
 * 所有的微服务类型,必须要先在这定义,之后才能在协议里使用
 */
export enum ServiceType {
    Base = 'Base',
    Chat = 'Chat',
    Guild = 'Guild',
    Task = 'Task',
    Comm = 'Comm',
    Center = 'Center',
    Http = 'Http',
    Mail = 'Mail',
    Gm = 'Gm',
    SceneLobby = 'SceneLobby',
    SceneRoom = 'SceneRoom',
}

/**
 * 通过继承该接口设置Req协议的服务类型(在ServiceType里定义)
 */
export interface Service<_T extends keyof typeof ServiceType> {}
