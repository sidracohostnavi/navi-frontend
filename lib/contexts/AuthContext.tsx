// /lib/contexts/AuthContext.tsx
'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createBrowserClient } from '@/lib/supabase/auth'
import { User, Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  session: Session | null
  workspaceId: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, workspaceName?: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  const supabase = createBrowserClient()
  
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchWorkspace(session.user.id)
      }
      setLoading(false)
    })
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchWorkspace(session.user.id)
        } else {
          setWorkspaceId(null)
        }
      }
    )
    
    return () => subscription.unsubscribe()
  }, [])
  
  async function fetchWorkspace(userId: string) {
    const { data } = await supabase
      .from('cohost_workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .single()
    
    setWorkspaceId(data?.workspace_id ?? null)
  }
  
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      return { error: error.message }
    }
    
    return {}
  }
  
  async function signUp(email: string, password: string, workspaceName?: string) {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, workspaceName }),
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      return { error: data.error }
    }
    
    return {}
  }
  
  async function signOut() {
    await supabase.auth.signOut()
    setWorkspaceId(null)
  }
  
  return (
    <AuthContext.Provider value={{
      user,
      session,
      workspaceId,
      loading,
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}