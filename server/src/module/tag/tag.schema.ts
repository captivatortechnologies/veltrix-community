// Tag types and interfaces

// Tag create request
export interface TagCreateRequestType {
  name: string;
  customerId?: string;
}

// Tag update request
export interface TagUpdateRequestType {
  name: string;
}

// Tag response
export interface TagResponseType {
  id: string;
  name: string;
  customerId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Request params
export interface CustomerIdParamsType {
  customerId: string;
}

export interface TagIdParamsType {
  id: string;
}

export interface CustomerTagIdParamsType extends CustomerIdParamsType {
  id: string;
}

export interface ProductIdParamsType {
  productId: string;
}
