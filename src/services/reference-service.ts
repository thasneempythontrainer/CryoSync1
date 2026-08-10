import { useQuery } from '@tanstack/react-query'
import { apiClient } from './api'
import type { Facility, Product, Supplier, AuthUser } from '@/types'

export async function getFacilities(): Promise<Facility[]> {
  return apiClient.get<Facility[]>('/facilities')
}

export async function getProducts(): Promise<Product[]> {
  return apiClient.get<Product[]>('/products')
}

export async function getSuppliers(): Promise<Supplier[]> {
  return apiClient.get<Supplier[]>('/suppliers')
}

export async function getUsers(): Promise<AuthUser[]> {
  return apiClient.get<AuthUser[]>('/users')
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    staleTime: 300_000,
  })
}

export function useFacilities() {
  return useQuery({
    queryKey: ['facilities'],
    queryFn: getFacilities,
    staleTime: 300_000,
  })
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
    staleTime: 300_000,
  })
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
    staleTime: 300_000,
  })
}
