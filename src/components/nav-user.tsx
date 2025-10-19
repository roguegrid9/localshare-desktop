import {
  LogOut,
  Sparkles,
  Settings,
  ChevronUp,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "./ui/avatar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "./ui/sidebar"
import { Badge } from "./ui/badge"

export function NavUser({
  user,
  onLogout,
  onManageSubscription,
}: {
  user: {
    name: string
    email: string
    avatar: string
    subscription_tier?: 'free' | 'relay'
  }
  onLogout?: () => void
  onManageSubscription?: () => void
}) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <Collapsible asChild defaultOpen={false}>
        <SidebarMenuItem className="flex flex-col-reverse">
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <Badge
                  variant={user.subscription_tier === 'relay' ? 'default' : 'outline'}
                  className={`w-fit text-[10px] px-1.5 py-0 h-4 ${
                    user.subscription_tier === 'relay'
                      ? 'bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end border-none'
                      : ''
                  }`}
                >
                  {user.subscription_tier === 'relay' ? 'Relay Access' : 'Free'}
                </Badge>
              </div>
              <ChevronUp className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton className="cursor-pointer" onClick={onManageSubscription}>
                  <Sparkles className="h-4 w-4" />
                  <span>Manage Subscription</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton className="cursor-pointer">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton className="cursor-pointer" onClick={onLogout}>
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </SidebarMenu>
  )
}
