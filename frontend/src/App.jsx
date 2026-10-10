import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import TabBar from './components/TabBar.jsx'
import Toast from './components/Toast.jsx'
import useHorizontalScroll from './components/useHorizontalScroll.js'
import Home from './screens/Home.jsx'
import Gallery, { PostRedirect } from './screens/Gallery.jsx'
import Discover from './screens/Discover.jsx'
import Search from './screens/Search.jsx'
import Bookings from './screens/Bookings.jsx'
import Profile from './screens/Profile.jsx'
import BookingRequest from './screens/BookingRequest.jsx'
import BookingDetail from './screens/BookingDetail.jsx'
import Delivery from './screens/Delivery.jsx'
import Review from './screens/Review.jsx'
import Inbox from './screens/Inbox.jsx'
import Chat from './screens/Chat.jsx'
import NewMessage from './screens/NewMessage.jsx'
import Me from './screens/Me.jsx'
import Upload from './screens/Upload.jsx'
import Verify from './screens/Verify.jsx'
import Settings from './screens/Settings.jsx'
import AiReview from './screens/AiReview.jsx'
import SignIn from './screens/SignIn.jsx'
import AuthCallback from './screens/AuthCallback.jsx'
import Welcome from './screens/Welcome.jsx'
import ResetPassword from './screens/ResetPassword.jsx'
import MyWork from './screens/MyWork.jsx'
import Planner from './screens/Planner.jsx'
import NewListing from './screens/NewListing.jsx'
import ServiceHome from './screens/ServiceHome.jsx'
import Occasion from './screens/Occasion.jsx'
import { useAuth } from './auth.jsx'

const TAB_ROUTES = ['/', '/discover', '/bookings', '/inbox', '/me']
const AUTH_ROUTES = ['/sign-in', '/auth/callback', '/welcome', '/reset-password']

export default function App() {
  const { pathname, search } = useLocation()
  const { needsWelcome } = useAuth()
  useHorizontalScroll('phone')
  const showTabs = TAB_ROUTES.includes(pathname)
  // A brand-new account picks a name before using the app.
  const welcomeRedirect = needsWelcome && !AUTH_ROUTES.includes(pathname)

  return (
    <div className="stage">
      <div className="phone" id="phone">
        <div className={`viewport ${showTabs ? 'with-tabs' : ''}`} key={pathname}>
          {welcomeRedirect && <Navigate to={`/welcome?next=${encodeURIComponent(pathname + search)}`} replace />}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/post/:id" element={<PostRedirect />} />
            <Route path="/gallery/:personId" element={<Gallery />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/search" element={<Search />} />
            <Route path="/u/:id" element={<Profile />} />
            <Route path="/book/:providerId" element={<BookingRequest />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/bookings/:id" element={<BookingDetail />} />
            <Route path="/bookings/:id/delivery" element={<Delivery />} />
            <Route path="/bookings/:id/review" element={<Review />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/inbox/new" element={<NewMessage />} />
            <Route path="/inbox/:id" element={<Chat />} />
            <Route path="/me" element={<Me />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/ai-review/:id" element={<AiReview />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/my-work" element={<MyWork />} />
            <Route path="/plan" element={<Planner />} />
            <Route path="/new-listing" element={<NewListing />} />
            <Route path="/services/:vertical" element={<ServiceHome />} />
            <Route path="/occasions/:slug" element={<Occasion />} />
          </Routes>
        </div>
        {showTabs && <TabBar />}
        <Toast />
      </div>
    </div>
  )
}
