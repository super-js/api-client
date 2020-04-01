import {observable, action} from "mobx";
import {ApiClient,ApiMethodType, IApiFetcherProps, IRequestProps} from "./client";

export interface IStateRequestProps extends IRequestProps {
    consumeError?: boolean;
    successMessage?: string;
    errorMessage?: string;
}

export interface IApiClientStoreProps extends IApiFetcherProps {

}

export class ApiClientWithStore<T = any> extends ApiClient<T> {

    @observable
    successMessage  = '';
    @observable
    errorMessage    = '';

    constructor(props: IApiClientStoreProps) {
        super(props);
    }

    _stateRequest = async (type: ApiMethodType, requestProps: IStateRequestProps) => {

        const {consumeError, successMessage, errorMessage, ..._requestProps} = requestProps;

        try {
            const response = await this._fetch(type, _requestProps);

            if(successMessage) this.setSuccessMessage(successMessage);

            return response;
        } catch(err) {

            if(errorMessage) this.setErrorMessage(errorMessage);
            if(!consumeError) throw err;
        }
    };

    get     = async (requestProps: IStateRequestProps): Promise<any> => this._stateRequest('GET', requestProps);
    post    = async (requestProps: IStateRequestProps): Promise<any> => this._stateRequest('POST', requestProps);
    put     = async (requestProps: IStateRequestProps): Promise<any> => this._stateRequest('PUT', requestProps);
    delete  = async (requestProps: IStateRequestProps): Promise<any> => this._stateRequest('DELETE', requestProps);

    @action.bound
    setSuccessMessage(successMessage: string) {
        this.successMessage = successMessage;
    }

    @action.bound
    setErrorMessage(errorMessage: string) {
        this.errorMessage = errorMessage;
    }
}