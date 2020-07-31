/// <reference types="node" />
import Queue from 'denque';
export interface IDeploymentConstructor {
    new (): IDeployment;
}
export interface IDeployment {
    deploy(): Promise<void>;
    address(): string | null;
    healthCheck(): Promise<boolean>;
    destroy(): Promise<void>;
}
declare class DeploymentWithPromises {
    deployment: IDeployment;
    deployPromise?: Promise<void>;
    constructor(deploymentConstructor: IDeploymentConstructor);
    destroy(): Promise<void>;
    address(): Promise<string | null>;
}
declare class Worker {
    maxAge: number;
    deploymentConstructor: IDeploymentConstructor;
    deployments: Queue<DeploymentWithPromises>;
    rotating: boolean;
    destroyed: boolean;
    rotateTick: ReturnType<typeof setTimeout>;
    constructor(deploymentConstructor: IDeploymentConstructor, maxAge: number);
    _rotate(): Promise<void>;
    rotate(): Promise<void>;
    address(): Promise<string | null>;
    destroy(): Promise<void>;
}
export interface IMasterProxyServerOption {
    port: number;
    maxWorkerAge: number;
    maxWorkerCount: number;
}
export declare class MasterProxyServerOption implements MasterProxyServerOption {
    port: number;
    maxWorkerAge: number;
    maxWorkerCount: number;
    constructor(port?: number, maxWorkerAge?: number, maxWorkerCount?: number);
}
export default class MasterProxyServer {
    option: IMasterProxyServerOption;
    workers: Worker[];
    requestCountsByHost: {
        [host: string]: number;
    };
    server: any;
    constructor(deploymentConstructor: IDeploymentConstructor, option?: Partial<IMasterProxyServerOption>);
    nextProxyUrl(host: string): Promise<string | null>;
    listen(): Promise<void>;
    close(): Promise<void>;
}
export {};
