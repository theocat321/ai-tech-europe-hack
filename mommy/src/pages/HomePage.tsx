import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const formSchema = z.object({
  clientName: z.string().min(1, 'Client name is required'),
  clientLinkedInUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  context: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

export default function HomePage() {
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientName: '',
      clientLinkedInUrl: '',
      context: '',
    },
  })

  const handleEnrich = async () => {
    const url = form.getValues('clientLinkedInUrl')
    if (!url) {
      setError('LinkedIn URL required for enrichment')
      return
    }
    setIsEnriching(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/enrich_linkedin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!response.ok) {
        throw new Error('Failed to enrich context')
      }
      const data = await response.json()
      form.setValue('context', data.autofill_context || '')
      setShowContext(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrichment failed')
    } finally {
      setIsEnriching(false)
    }
  }

  const handleSkip = () => {
    form.setValue('context', '')
    setShowContext(true)
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    navigate('/chat', { state: { context: data.context, clientName: data.clientName } })
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-rose-50 via-white to-rose-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="w-full px-4 py-16">
        <div className="w-full flex justify-center items-center">
          {!showForm ? (
            <div className="text-center space-y-8">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
                AI Chat Assistant
              </h1>
              <p className="text-xl text-muted-foreground">
                Ready to start your conversation? Let's get your client context set up.
              </p>
              <Button
                size="lg"
                onClick={() => setShowForm(true)}
                className="text-lg px-8 py-3"
              >
                I'm Ready
              </Button>
            </div>
          ) : (
            <Card className="w-full max-w-lg">
              <CardHeader>
                <CardTitle>Client Context</CardTitle>
                <CardDescription>
                  Please provide your client information to start the call.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="clientName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="clientName">Client Name</FormLabel>
                          <FormControl>
                            <Input
                              id="clientName"
                              placeholder="Enter client name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="clientLinkedInUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="clientLinkedInUrl">
                            Client LinkedIn URL (optional)
                          </FormLabel>
                          <FormControl>
                            <Input
                              id="clientLinkedInUrl"
                              type="url"
                              placeholder="https://linkedin.com/in/..."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {error && <p className="text-red-500">{error}</p>}
                    {!showContext ? (
                      <div className="flex gap-3 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowForm(false)}
                          disabled={isEnriching || isSubmitting}
                          className="flex-1"
                        >
                          Back
                        </Button>
                        <Button
                          type="button"
                          onClick={handleEnrich}
                          disabled={isEnriching}
                          className="flex-1"
                        >
                          {isEnriching ? 'Enriching...' : 'Enrich context'}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleSkip}
                          disabled={isEnriching}
                          className="flex-1"
                        >
                          Skip
                        </Button>
                      </div>
                    ) : (
                      <>
                        <FormField
                          control={form.control}
                          name="context"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel htmlFor="context">Context</FormLabel>
                              <FormControl>
                                <textarea
                                  id="context"
                                  rows={6}
                                  className="w-full border rounded-md p-2"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex gap-3 pt-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowContext(false)}
                            disabled={isSubmitting}
                            className="flex-1"
                          >
                            Back
                          </Button>
                          <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1"
                          >
                            {isSubmitting ? 'Starting...' : 'Start call'}
                          </Button>
                        </div>
                      </>
                    )}
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
} 