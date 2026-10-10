// Placeholder for screens not ported yet, so every route exists and navigation is complete.
// Replace the route file's `<ComingSoon .../>` with the real screen when you port it.
import { useRouter } from 'expo-router'
import { Hammer, type LucideIcon } from 'lucide-react-native'

import { Button, EmptyState, Screen } from '@/components'

type Props = {
  title: string
  icon?: LucideIcon
  text?: string
  back?: boolean // false for tab screens
}

export default function ComingSoon({ title, icon = Hammer, text, back = true }: Props) {
  const router = useRouter()
  return (
    <Screen title={title} back={back}>
      <EmptyState
        icon={icon}
        title="Coming soon in the app"
        text={text ?? 'This screen isn’t in the app yet. You can use it on the web app in the meantime.'}
        action={back ? <Button title="Go home" variant="ghost" size="sm" onPress={() => router.replace('/')} /> : undefined}
      />
    </Screen>
  )
}
