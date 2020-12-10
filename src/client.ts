import {History} from "history";

export type ApiMethodType     = 'GET' | 'POST' | 'PUT' | 'DELETE';
export interface ApiFetchParams {
    [key: string]: any;
}
export interface ApiFetchOptions {
    requestKey?: string;
    successMsg?: string;
    errorMsg?: string;
    processingMsg?: string;
    errorRedirectTo?: ((data: any) => string) | string;
    successRedirectTo?: ((data: any) => string) | string;
    propagateError?: boolean;
}

export interface IApiRequestProgress {
    type: 'processing' | 'success' | 'error',
    message: string;
}


export type OnRequestProgress = (requestKey: string, apiRequestProgress: IApiRequestProgress) => void;

export interface IApiClientOptions {
    host: string;
    port?: number;
    version?: string;
    onRequestProgress?: OnRequestProgress;
    history?: History;
}

export interface IRequestProps {
    path: string;
    params?: ApiFetchParams;
    options?: ApiFetchOptions;
}

export type TEndpointGetter<T> = (apiFetcher: ApiClient<T>) => T;

class ResponseError extends Error {

    status              : number;
    validationErrors    : any;

    constructor(props) {
        super(props.message);

        this.status             = props.status;
        this.validationErrors   = props.validationErrors;
    }
}

const parseResponse = (response: Response) => {
    const contentType = response.headers.get('content-type');

    if(contentType) {
        if(contentType.includes('text')) return response.text();
        if(contentType.includes('json')) return response.json();
    }

    return null;
};


export class ApiClient<T = any> {

    endpoints: T = {} as T;
    baseUrl = '';
    onRequestProgress: OnRequestProgress;
    history: History;

    _csrfToken = "";

    constructor(props: IApiClientOptions) {
        const {host, port, version, onRequestProgress, history} = props;

        this.baseUrl = `${host}${port ? `:${port}` : ''}${version ? `/${version}` : ''}`;
        this.onRequestProgress = onRequestProgress;
        this.history = history;
    }

    _onRequestProgress(requestKey: string, apiRequestProgress: IApiRequestProgress) {
        if(typeof this.onRequestProgress === "function") {
            this.onRequestProgress(requestKey, apiRequestProgress);
        }
    }

    _redirectTo(targetUrl) {
        if(this.history && targetUrl) this.history.push(targetUrl);
    }

    _fetch = async (type: ApiMethodType, requestProps: IRequestProps): Promise<any> => {

        const {path, params = {}, options = {}} = requestProps;


        const requestKey = options.requestKey ? options.requestKey : `${Date.now()}_${type}_${requestProps.path}`;
        let res: Response;

        const reportRequestProgress = (requestProgressType: any, message: string) => {
            if(options.hasOwnProperty(`${requestProgressType}Msg`)) {
                this._onRequestProgress(requestKey, {
                    type: requestProgressType,
                    message
                })
            }
        };

        try {


            reportRequestProgress(
                'processing',
                options.processingMsg
            );

            const targetUrl: URL      = new URL(`${this.baseUrl}${path}`, location.href);

            if(type === "GET") targetUrl.search    = new URLSearchParams(params).toString();

            const _isFile = param => param instanceof File
                || Array.isArray(param) && param.some(p => p instanceof File);

            const _hasFiles = Object.keys(params).some(paramCode => _isFile(params[paramCode]));

            const _getBody = () => {
                if(_hasFiles) {
                    const formData = new FormData();
                    Object.keys(params).forEach(paramCode => {
                        if(Array.isArray(params[paramCode]) && _isFile(params[paramCode])) {
                            params[paramCode]
                                .forEach((fileParam, fileParamIx) => formData.append(`${paramCode}[${fileParamIx}]`, fileParam))
                        } else {
                            formData.append(paramCode, params[paramCode]);
                        }

                    });

                    return formData;
                } else {
                    return type !== "GET" ? JSON.stringify(params) : undefined;
                }
            };

            let headers = {
                'Accept'        : 'application/json'
            };

            if(!_hasFiles) headers['Content-Type'] = 'application/json';

            let request = new Request(targetUrl.toString(), {
                method      : type,
                headers     : new Headers(headers),
                mode        : "cors",
                credentials : 'include',
                body        : _getBody()
            });

            res = await fetch(request);
            let parsedResponse = await parseResponse(res);

            if(!res.ok) {
                if(typeof parsedResponse === "string") {
                    parsedResponse = {
                        name: res.statusText,
                        message: parsedResponse
                    }
                } else if(!parsedResponse) {
                    parsedResponse = {
                        name: 'Unknown error',
                        message: 'Unknown error'
                    }
                }

                throw new ResponseError({
                    name                : parsedResponse.name,
                    message             : parsedResponse.message,
                    status              : res.status,
                    validationErrors    : parsedResponse.validationErrors ? parsedResponse.validationErrors : {}
                });

            } else {
                reportRequestProgress(
                    'success',
                    options.successMsg
                );

                if(options.successRedirectTo) {
                    this._redirectTo(
                        typeof options.successRedirectTo === "function" ? options.successRedirectTo(parsedResponse) : options.successRedirectTo
                    )
                }
            }

            return parsedResponse;

        } catch(err) {
            reportRequestProgress(
                'error',
                options.errorMsg
            );

            if(options.propagateError) throw err;

            if(options.errorRedirectTo) {
                this._redirectTo(
                    typeof options.errorRedirectTo === "function" ? options.errorRedirectTo(err) : options.errorRedirectTo
                )
            }
        }

    };

    registerEndpoints = (endpointsGetter: TEndpointGetter<T>) => {
        this.endpoints = endpointsGetter(this);
    };

    get = (requestProps: IRequestProps) => this._fetch('GET', requestProps);
    post = (requestProps: IRequestProps) => this._fetch('POST', requestProps);
    put = (requestProps: IRequestProps) => this._fetch('PUT', requestProps);
    delete = (requestProps: IRequestProps) => this._fetch('DELETE', requestProps);
}