import { Route, Routes, useLocation } from 'react-router-dom'
import TabBar from './components/TabBar.jsx'
import Toast from './components/Toast.jsx'
import Home from './screens/Home.jsx'
import PostDetail from './screens/PostDetail.jsx'
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
import Me from './screens/Me.jsx'
import Upload from './screens/Upload.jsx'
import Verify from './screens/Verify.jsx'
import AiReview from './screens/AiReview.jsx'

const TAB_ROUTES = ['/', '/discover', '/bookings', '/inbox', '/me']

export default function App() {
  const { pathname } = useLocation()
  const showTabs = TAB_ROUTES.includes(pathname)

  return (
    <div className="stage">
      <div className="phone" id="phone">
        <div className={`viewport ${showTabs ? 'with-tabs' : ''}`} key={pathname}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/post/:id" element={<PostDetail />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/search" element={<Search />} />
            <Route path="/u/:id" element={<Profile />} />
            <Route path="/book/:providerId" element={<BookingRequest />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/bookings/:id" element={<BookingDetail />} />
            <Route path="/bookings/:id/delivery" element={<Delivery />} />
            <Route path="/bookings/:id/review" element={<Review />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/inbox/:id" element={<Chat />} />
            <Route path="/me" element={<Me />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/ai-review/:id" element={<AiReview />} />
          </Routes>
        </div>
        {showTabs && <TabBar />}
        <Toast />
      </div>
    </div>
  )
}
