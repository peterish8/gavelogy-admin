'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen, CheckCircle, XCircle, Calendar, DollarSign, IndianRupee, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useHeaderStore } from '@/lib/stores/header-store'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'

interface Creator {
  id: string
  name: string
  email: string
  avatar_url: string | null
}

interface Course {
  _id: string
  name: string
  description: string | null
  price: number | null
  is_active: boolean | null
  is_free: boolean | null
  created_at: string | null
  updated_at: string | null
}

interface CreatorData {
  creator: Creator
  courses: Course[]
}

interface RevenueData {
  totalRevenue: number
  totalOrders: number
  revenueByMonth: { month: string; amount: number }[]
  revenueByCourse: { courseId: string; courseName: string; amount: number }[]
}

interface CreatorDetailClientProps {
  initialData: CreatorData
  initialRevenue: RevenueData
}

export default function CreatorDetailClient({ initialData, initialRevenue }: CreatorDetailClientProps) {
  const router = useRouter()
  const setHeader = useHeaderStore(state => state.setHeader)
  const clearHeader = useHeaderStore(state => state.clearHeader)

  // Revenue breakdown modal state
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Fetch filtered revenue data when dates change
  const filteredRevenue = useQuery(
    api.adminQueries.getCreatorRevenue,
    startDate || endDate
      ? {
          userId: initialData.creator.id as any,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }
      : 'skip'
  )

  const currentRevenueData = filteredRevenue || initialRevenue

  // Calculate stats
  const totalCourses = initialData.courses.length
  const activeCourses = initialData.courses.filter(c => c.is_active).length
  const totalRevenue = initialData.courses.reduce((sum, c) => sum + (c.price || 0), 0)

  // Set page header with back button
  useEffect(() => {
    const headerActions = (
      <Button onClick={() => router.back()} variant="outline">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Revenue
      </Button>
    )
    setHeader(initialData.creator.name, headerActions)
    return () => clearHeader()
  }, [initialData.creator.name, setHeader, clearHeader, router])

  return (
    <div className="space-y-6">
      {/* Creator Profile Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            {initialData.creator.avatar_url && (
              <img
                src={initialData.creator.avatar_url}
                alt={initialData.creator.name}
                className="w-20 h-20 rounded-full"
              />
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-1">{initialData.creator.name}</h2>
              <p className="text-muted-foreground mb-4">{initialData.creator.email}</p>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-lg font-semibold">{totalCourses}</p>
                    <p className="text-xs text-muted-foreground">Courses</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <div>
                    <p className="text-lg font-semibold">{activeCourses}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-lg font-semibold">₹{totalRevenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">List Price</p>
                  </div>
                </div>
                <Dialog open={isRevenueModalOpen} onOpenChange={setIsRevenueModalOpen}>
                  <DialogTrigger asChild>
                    <div className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors">
                      <IndianRupee className="w-4 h-4 text-green-500" />
                      <div>
                        <p className="text-lg font-semibold text-green-600">₹{currentRevenueData.totalRevenue.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          Actual Revenue
                        </p>
                      </div>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Revenue Breakdown - {initialData.creator.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      {/* Date Filter */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Start Date</Label>
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>End Date</Label>
                          <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="grid grid-cols-2 gap-4">
                        <Card>
                          <CardContent className="p-4">
                            <p className="text-sm text-muted-foreground">Total Revenue</p>
                            <p className="text-2xl font-bold text-green-600">
                              ₹{currentRevenueData.totalRevenue.toLocaleString()}
                            </p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4">
                            <p className="text-sm text-muted-foreground">Total Orders</p>
                            <p className="text-2xl font-bold">
                              {currentRevenueData.totalOrders}
                            </p>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Revenue by Month */}
                      {currentRevenueData.revenueByMonth.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Revenue by Month</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Month</TableHead>
                                  <TableHead className="text-right">Revenue</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {currentRevenueData.revenueByMonth.map((item: { month: string; amount: number }) => (
                                  <TableRow key={item.month}>
                                    <TableCell>{item.month}</TableCell>
                                    <TableCell className="text-right font-semibold text-green-600">
                                      ₹{item.amount.toLocaleString()}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}

                      {/* Revenue by Course */}
                      {currentRevenueData.revenueByCourse.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Revenue by Course</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Course</TableHead>
                                  <TableHead className="text-right">Revenue</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {currentRevenueData.revenueByCourse
                                  .sort((a: { amount: number }, b: { amount: number }) => b.amount - a.amount)
                                  .map((item: { courseId: string; courseName: string; amount: number }) => (
                                    <TableRow key={item.courseId}>
                                      <TableCell>{item.courseName}</TableCell>
                                      <TableCell className="text-right font-semibold text-green-600">
                                        ₹{item.amount.toLocaleString()}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Courses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Courses by {initialData.creator.name}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialData.courses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No courses found for this creator
                  </TableCell>
                </TableRow>
              ) : (
                initialData.courses.map((course) => (
                  <TableRow key={course._id}>
                    <TableCell className="font-medium">
                      <Button
                        variant="link"
                        className="p-0 h-auto font-medium"
                        onClick={() => router.push(`/admin/studio/${course._id}`)}
                      >
                        {course.name}
                      </Button>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {course.description || '-'}
                    </TableCell>
                    <TableCell>
                      {course.is_free ? (
                        <Badge variant="secondary">Free</Badge>
                      ) : course.price ? (
                        <span>₹{course.price.toLocaleString()}</span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {course.is_active ? (
                        <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {course.created_at ? new Date(course.created_at).toLocaleDateString() : '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {course.updated_at ? new Date(course.updated_at).toLocaleDateString() : '-'}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
