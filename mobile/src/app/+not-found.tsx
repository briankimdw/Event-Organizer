import { useRouter } from 'expo-router'
import { SearchX } from 'lucide-react-native'

import { Button, EmptyState, Screen } from '@/components'

export default function NotFound() {
  const router = useRouter()
  return (
    <Screen title="Not found" back>
      <EmptyState
        icon={SearchX}
        title="This page doesn’t exist"
        text="The link may be broken, or the page may have moved."
        action={<Button title="Go home" size="sm" onPress={() => router.replace('/')} />}
      />
    </Screen>
  )
}
