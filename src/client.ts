export type ApiMethodType     = 'GET' | 'POST' | 'PUT' | 'DELETE';
export interface ApiFetchParams {
    [key: string]: any;
}
export interface ApiFetchOptions {
    requestKey?: string;
    successMsg?: string;
    errorMsg?: string;
    processingMsg?: string;
    errorRedirectTo?: string;
    propagateError?: boolean;
}

export interface IApiRequestProgress {
    type: 'processing' | 'success' | 'error',
    message: string;
}


export type OnRequestProgress = (requestKey: string, apiRequestProgress: IApiRequestProgress) => void;

export interface IApiFetcherProps {
    host: string;
    port?: number;
    version: string;
    onRequestProgress?: OnRequestProgress;
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
        this.validationErrors   = Object.keys(props.validationErrors).reduce((_, parameterCode) => {
            _.push(...props.validationErrors[parameterCode]);
            return _;
        }, []);
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

    constructor(props: IApiFetcherProps) {
        const {host, port, version, onRequestProgress} = props;

        this.baseUrl = `${host}${port ? `:${port}` : ''}/api/${version}`;
        this.onRequestProgress = onRequestProgress;
    }

    _onRequestProgress(requestKey: string, apiRequestProgress: IApiRequestProgress) {
        if(typeof this.onRequestProgress === "function") {
            this.onRequestProgress(requestKey, apiRequestProgress);
        }
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

            const hasFiles = Object.keys(params).some(paramCode => params[paramCode] instanceof File);

            const _getBody = () => {
                if(hasFiles) {
                    const formData = new FormData();
                    Object.keys(params).forEach(paramCode => {
                        formData.append(paramCode, params[paramCode]);
                    });

                    return formData;
                } else {
                    return type !== "GET" ? JSON.stringify(params) : undefined;
                }
            };

            let headers = {
                'Accept'        : 'application/json'
            };

            if(!hasFiles) headers['Content-Type'] = 'application/json';

            let request = new Request(targetUrl.toString(), {
                method      : type,
                headers     : new Headers(headers),
                mode        : "cors",
                credentials : 'include',
                body        : _getBody()
            });

            res = await fetch(request);

            if(!res.ok) {

                let error = await parseResponse(res);

                if(typeof error === "string") {
                    error = {
                        name: res.statusText,
                        message: error
                    }
                } else if(!error) {
                    error = {
                        name: 'Unknown error',
                        message: 'Unknown error'
                    }
                }

                throw new ResponseError({
                    name                : error.name,
                    message             : error.message,
                    status              : res.status,
                    validationErrors    : error.validationErrors ? error.validationErrors : {}
                });

            } else {
                reportRequestProgress(
                    'success',
                    options.successMsg
                );
            }

            return parseResponse(res);

        } catch(err) {

            reportRequestProgress(
                'error',
                options.errorMsg
            );

            if(options.propagateError) throw err;
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