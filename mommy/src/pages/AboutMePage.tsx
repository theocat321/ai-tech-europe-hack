import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function AboutMePage() {
  const [context, setContext] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchContext = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch(`${API_URL}/api/personal_context`)
        if (!response.ok) {
          throw new Error('Failed to fetch personal context.')
        }
        const data = await response.text()
        setContext(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchContext()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/personal_context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: context }),
      })
      if (!response.ok) {
        throw new Error('Failed to save personal context.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-rose-50 via-white to-rose-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="w-full px-4 py-16">
        <div className="w-full flex justify-center items-center">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>About Me</CardTitle>
              <CardDescription>
                This is your personal context. It will be used to tailor the AI's responses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p>Loading...</p>
              ) : error ? (
                <p className="text-red-500">{error}</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid w-full gap-1.5">
                    <Label htmlFor="context">Your Personal Context</Label>
                    <textarea
                      id="context"
                      placeholder="Tell me about yourself..."
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      rows={15}
                    />
                  </div>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Context'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
